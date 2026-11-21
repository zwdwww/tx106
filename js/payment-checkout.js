/*
 * 支付收银台与下载门禁
 */

'use strict';

(function initPaymentRuntime(global) {
  const CHANNELS = [
    { code: 'wechat', label: '微信支付' }
  ];

  const AMOUNT_FEN = 100;
  const EMBEDDED_BROWSER_BLOCK_MESSAGE = '检测到当前为应用内置页面，请点击右上角并选择在系统浏览器中打开后再支付下载。';
  const ORDER_STATUS = Object.freeze({
    NOTPAY: 'NOTPAY',
    SUCCESS: 'SUCCESS',
    CLOSED: 'CLOSED',
    FAILED: 'FAILED'
  });
  const DEFAULT_ENDPOINTS = Object.freeze({
    apiOrigin: '',
    apiBasePath: 'api/payments'
  });

  const toYuan = (fen) => (fen / 100).toFixed(2);

  function pickFirstString(candidates) {
    for (let i = 0; i < candidates.length; i += 1) {
      const value = candidates[i];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return '';
  }

  function normalizeStatus(statusValue) {
    const raw = typeof statusValue === 'string' ? statusValue.trim().toUpperCase() : '';
    if (!raw) {
      return '';
    }

    if (raw === 'SUCCESS' || raw === 'TRADE_SUCCESS' || raw === 'PAY_SUCCESS' || raw === 'PAID') {
      return ORDER_STATUS.SUCCESS;
    }

    if (raw === 'NOTPAY' || raw === 'PENDING' || raw === 'CREATED' || raw === 'USERPAYING') {
      return ORDER_STATUS.NOTPAY;
    }

    if (raw === 'CLOSED' || raw === 'CANCELLED' || raw === 'REVOKED') {
      return ORDER_STATUS.CLOSED;
    }

    if (raw === 'FAILED' || raw === 'PAYERROR' || raw === 'ERROR') {
      return ORDER_STATUS.FAILED;
    }

    return raw;
  }

  function trimTrailingSlash(value) {
    if (!value) {
      return '';
    }
    return value.replace(/\/+$/, '');
  }

  function normalizeBasePath(value, fallback) {
    const raw = typeof value === 'string' && value.trim() ? value.trim() : fallback;
    return trimTrailingSlash(raw.replace(/^\/+/, ''));
  }

  function resolveApiBaseUrl(apiOrigin, apiBasePath) {
    const rootURL = apiOrigin
      ? new URL(`${trimTrailingSlash(apiOrigin)}/`)
      : new URL(global.document.baseURI);
    return new URL(`${apiBasePath}/`, rootURL);
  }

  function toWsUrl(httpURL) {
    const wsURL = new URL(httpURL.href);
    wsURL.protocol = httpURL.protocol === 'https:' ? 'wss:' : 'ws:';
    return wsURL;
  }

  class PaymentEndpointResolver {
    static getRuntimeConfig() {
      const config = global.PaymentRuntimeConfig || {};

      return {
        apiOrigin: typeof config.apiOrigin === 'string' ? trimTrailingSlash(config.apiOrigin.trim()) : DEFAULT_ENDPOINTS.apiOrigin,
        apiBasePath: normalizeBasePath(config.apiBasePath, DEFAULT_ENDPOINTS.apiBasePath)
      };
    }

    static buildApiUrl(resource) {
      const config = PaymentEndpointResolver.getRuntimeConfig();
      const baseURL = resolveApiBaseUrl(config.apiOrigin, config.apiBasePath);
      const path = resource.replace(/^\/+/, '');
      return new URL(path, baseURL).href;
    }

    static buildOrderWsUrl(orderId) {
      const config = PaymentEndpointResolver.getRuntimeConfig();
      const baseURL = resolveApiBaseUrl(config.apiOrigin, config.apiBasePath);
      const wsURL = toWsUrl(new URL('ws', baseURL));
      wsURL.searchParams.set('orderId', orderId);
      return wsURL.href;
    }
  }

  function normalizeOrderResponse(data) {
    const orderId = pickFirstString([
      data && data.orderId,
      data && data.order_id,
      data && data.outTradeNo,
      data && data.out_trade_no,
      data && data.id,
      data && data.tradeNo,
      data && data.trade_no
    ]);

    if (!orderId) {
      throw new Error('创建订单失败: 响应缺少订单号');
    }

    const paymentPayload = (data && typeof data.payment === 'object' && data.payment) || {};
    const channelPayload = (data && typeof data.channelData === 'object' && data.channelData) || {};
    const mergedPayload = {
      ...channelPayload,
      ...paymentPayload,
      ...data
    };

    return {
      orderId,
      amountFen: Number(data && data.amountFen) || AMOUNT_FEN,
      channel: pickFirstString([data && data.channel]) || 'wechat',
      payMode: pickFirstString([data && data.payMode, mergedPayload.payMode]).toLowerCase(),
      qrCodeUrl: pickFirstString([data && data.qrCodeUrl, mergedPayload.qrCodeUrl, mergedPayload.codeUrl, mergedPayload.code_url]),
      h5PayUrl: pickFirstString([data && data.h5PayUrl, mergedPayload.h5PayUrl, mergedPayload.h5_url, mergedPayload.mwebUrl, mergedPayload.mweb_url]),
      raw: data
    };
  }

  function normalizeStatusResponse(data) {
    const orderId = pickFirstString([
      data && data.orderId,
      data && data.order_id,
      data && data.outTradeNo,
      data && data.out_trade_no,
      data && data.id
    ]);
    const status = normalizeStatus(
      pickFirstString([
        data && data.status,
        data && data.orderStatus,
        data && data.order_status,
        data && data.tradeState,
        data && data.trade_state,
        data && data.state
      ])
    );

    if (!status) {
      throw new Error('查询订单失败: 响应缺少状态');
    }

    return { orderId, status, raw: data };
  }

  function extractWsOrderStatus(payload) {
    const scopes = [
      payload,
      payload && payload.data,
      payload && payload.payload,
      payload && payload.result
    ];

    for (let i = 0; i < scopes.length; i += 1) {
      const scope = scopes[i];
      if (!scope || typeof scope !== 'object') {
        continue;
      }

      const status = normalizeStatus(
        pickFirstString([
          scope.status,
          scope.orderStatus,
          scope.order_status,
          scope.tradeState,
          scope.trade_state,
          scope.state
        ])
      );

      if (!status) {
        continue;
      }

      const orderId = pickFirstString([
        scope.orderId,
        scope.order_id,
        scope.outTradeNo,
        scope.out_trade_no,
        scope.id
      ]);

      return { orderId, status };
    }

    return null;
  }

  function detectUaContext() {
    const ua = navigator.userAgent || '';
    const isMobile = /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua);
    const isWeChat = /MicroMessenger/i.test(ua);
    const isAlipay = /AlipayClient/i.test(ua);
    const isEmbeddedAppWebView = /MicroMessenger|AlipayClient|QQ\/|Weibo|DingTalk|Lark|Feishu/i.test(ua);

    let uaContext = 'normal';
    if (isWeChat) {
      uaContext = 'wechat';
    } else if (isAlipay) {
      uaContext = 'alipay';
    }

    return {
      ua,
      isMobile,
      isWeChat,
      isAlipay,
      isEmbeddedAppWebView,
      clientType: isMobile ? 'mobile' : 'pc',
      uaContext
    };
  }

  function resolvePayMode(uaContextInfo) {
    if (!uaContextInfo || uaContextInfo.clientType === 'pc') {
      return 'qr';
    }

    return 'h5';
  }

  class PaymentApi {
    static async createOrder(payload) {
      const response = await fetch(PaymentEndpointResolver.buildApiUrl('orders'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`创建订单失败: HTTP ${response.status}`);
      }

      const data = await response.json();
      return normalizeOrderResponse(data || {});
    }

    static async queryOrderStatus(orderId) {
      const response = await fetch(PaymentEndpointResolver.buildApiUrl(`orders/${encodeURIComponent(orderId)}`), {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`查询订单失败: HTTP ${response.status}`);
      }

      const data = await response.json();
      return normalizeStatusResponse(data || {});
    }
  }

  class PaymentCheckoutModal {
    constructor() {
      this.state = {
        visible: false,
        channels: CHANNELS,
        selectedChannel: CHANNELS[0].code,
        amountFen: AMOUNT_FEN,
        clientType: 'pc',
        uaContext: 'normal',
        order: null,
        loading: false,
        statusText: ''
      };
      this.refs = {};
      this.onPay = null;
      this.onCancel = null;
      this.mount();
    }

    mount() {
      const root = document.createElement('div');
      root.id = 'paymentCheckoutModal';
      root.className = 'pay-modal-mask hidden';
      root.innerHTML = `
        <div class="pay-modal">
          <div class="pay-modal-header">
            <h4>支付收银台</h4>
            <button type="button" class="pay-close" aria-label="关闭">×</button>
          </div>
          <div class="pay-amount">每次收费 <strong id="payAmountText">¥1.00</strong></div>
          <div class="pay-channel-row" id="payChannelRow"></div>
          <div class="pay-content">
            <div id="payQrBlock" class="pay-qr-block hidden">
              <img id="payQrImage" alt="支付二维码" />
              <p>请使用微信扫码完成支付</p>
            </div>
            <div id="payMobileBlock" class="pay-mobile-block hidden">
              <p id="payMobileTip">请点击下方按钮前往支付。</p>
              <button type="button" id="payGoButton" class="btn btn-primary pay-go-btn">前往支付</button>
            </div>
            <div id="payStatusText" class="pay-status-text"></div>
          </div>
        </div>
      `;

      document.body.appendChild(root);

      this.refs.root = root;
      this.refs.closeButton = root.querySelector('.pay-close');
      this.refs.channelRow = root.querySelector('#payChannelRow');
      this.refs.amountText = root.querySelector('#payAmountText');
      this.refs.qrBlock = root.querySelector('#payQrBlock');
      this.refs.qrImage = root.querySelector('#payQrImage');
      this.refs.mobileBlock = root.querySelector('#payMobileBlock');
      this.refs.mobileTip = root.querySelector('#payMobileTip');
      this.refs.goButton = root.querySelector('#payGoButton');
      this.refs.statusText = root.querySelector('#payStatusText');

      this.refs.closeButton.addEventListener('click', () => {
        this.hide();
        if (this.onCancel) {
          this.onCancel();
        }
      });

      this.refs.goButton.addEventListener('click', () => {
        if (this.onPay) {
          this.onPay(this.state.selectedChannel);
        }
      });
    }

    setState(patch) {
      this.state = { ...this.state, ...patch };
      this.render();
    }

    show(config) {
      this.onPay = config.onPay;
      this.onCancel = config.onCancel;
      this.setState({
        visible: true,
        clientType: config.clientType,
        uaContext: config.uaContext,
        amountFen: config.amountFen || AMOUNT_FEN,
        order: config.order || null,
        statusText: ''
      });
    }

    hide() {
      this.setState({ visible: false, statusText: '' });
    }

    setOrder(order) {
      this.setState({ order });
    }

    setStatusText(text) {
      this.setState({ statusText: text || '' });
    }

    renderChannels() {
      this.refs.channelRow.innerHTML = '';
      for (let i = 0; i < this.state.channels.length; i += 1) {
        const channel = this.state.channels[i];
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `pay-channel-item${channel.code === this.state.selectedChannel ? ' active' : ''}`;
        item.textContent = channel.label;
        item.addEventListener('click', () => {
          this.setState({ selectedChannel: channel.code });
        });
        this.refs.channelRow.appendChild(item);
      }
    }

    render() {
      const isVisible = this.state.visible;
      this.refs.root.classList.toggle('hidden', !isVisible);
      if (!isVisible) {
        return;
      }

      this.refs.amountText.textContent = `¥${toYuan(this.state.amountFen)}`;
      this.renderChannels();

      const order = this.state.order || {};
      const payMode = (order.payMode || '').toLowerCase();
      const isPc = this.state.clientType === 'pc';
      const showQr = payMode === 'qr' && Boolean(order.qrCodeUrl);
      const showMobile = !showQr;

      this.refs.qrBlock.classList.toggle('hidden', !showQr);
      if (showQr) {
        this.refs.qrImage.src = order.qrCodeUrl;
      }

      this.refs.mobileBlock.classList.toggle('hidden', !showMobile);
      if (showMobile) {
        const tip = '请点击下方按钮前往支付。';
        this.refs.mobileTip.textContent = tip;
      }

      this.refs.statusText.textContent = this.state.statusText;
    }
  }

  class PaymentFlow {
    constructor() {
      this.modal = new PaymentCheckoutModal();
      this.pollTimer = null;
      this.pollDeadline = 0;
      this.activeOrderId = '';
      this.orderWs = null;
      this.usePollingFallback = false;
      this.pollingStarted = false;
      this.pollingInFlight = false;
    }

    clearPolling() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
      this.pollingStarted = false;
      this.pollingInFlight = false;
      this.usePollingFallback = false;
    }

    clearOrderWs() {
      if (this.orderWs) {
        this.orderWs.onopen = null;
        this.orderWs.onmessage = null;
        this.orderWs.onerror = null;
        this.orderWs.onclose = null;
        this.orderWs.close();
        this.orderWs = null;
      }
    }

    clearStatusWatchers() {
      this.clearPolling();
      this.clearOrderWs();
    }

    markPaymentSuccess(onPaidDownload) {
      this.modal.setStatusText('支付成功，正在触发下载...');
      this.clearStatusWatchers();
      this.modal.hide();
      onPaidDownload();
      this.activeOrderId = '';
    }

    handleTerminalStatus(status) {
      if (status === ORDER_STATUS.CLOSED || status === ORDER_STATUS.FAILED) {
        this.modal.setStatusText('订单已关闭或支付失败，请重新发起下载。');
        this.clearStatusWatchers();
        this.activeOrderId = '';
        return true;
      }
      return false;
    }

    buildOrderWsUrl(orderId) {
      return PaymentEndpointResolver.buildOrderWsUrl(orderId);
    }

    startPollingFallback(onPaidDownload) {
      if (!this.activeOrderId || this.pollingStarted) {
        return;
      }
      this.usePollingFallback = true;
      this.pollingStarted = true;
      this.modal.setStatusText('当前使用轮询兜底确认支付结果...');
      this.pollTimer = setInterval(() => {
        this.pollPaymentStatusOnce(onPaidDownload);
      }, 2000);
      this.pollPaymentStatusOnce(onPaidDownload);
    }

    startWsWatcher(onPaidDownload) {
      if (!global.WebSocket || !this.activeOrderId) {
        return false;
      }

      try {
        const wsUrl = this.buildOrderWsUrl(this.activeOrderId);
        this.orderWs = new WebSocket(wsUrl);
      } catch (error) {
        return false;
      }

      this.orderWs.onopen = () => {
        this.modal.setStatusText('已连接支付状态通道，等待支付结果...');
      };

      this.orderWs.onmessage = (event) => {
        let payload;
        try {
          payload = JSON.parse(event.data || '{}');
        } catch (error) {
          this.modal.setStatusText('支付状态消息解析失败，已切换轮询兜底。');
          this.startPollingFallback(onPaidDownload);
          return;
        }

        const statusPayload = extractWsOrderStatus(payload);
        if (!statusPayload || !statusPayload.status) {
          return;
        }

        if (statusPayload.orderId && statusPayload.orderId !== this.activeOrderId) {
          return;
        }

        if (statusPayload.status === ORDER_STATUS.SUCCESS) {
          this.markPaymentSuccess(onPaidDownload);
          return;
        }

        this.handleTerminalStatus(statusPayload.status);
      };

      this.orderWs.onerror = () => {
        this.modal.setStatusText('支付状态通道异常，已切换轮询兜底。');
        this.startPollingFallback(onPaidDownload);
      };

      this.orderWs.onclose = () => {
        if (!this.activeOrderId) {
          return;
        }
        this.modal.setStatusText('支付状态通道已关闭，已切换轮询兜底。');
        this.startPollingFallback(onPaidDownload);
      };

      return true;
    }

    startStatusWatcher(onPaidDownload) {
      this.clearStatusWatchers();

      if (!this.startWsWatcher(onPaidDownload)) {
        this.startPollingFallback(onPaidDownload);
      }
    }

    async start(productType, onPaidDownload) {
      const ua = detectUaContext();

      if (ua.isEmbeddedAppWebView) {
        alert(EMBEDDED_BROWSER_BLOCK_MESSAGE);
        return;
      }

      const payMode = resolvePayMode(ua);

      let order;
      try {
        order = await PaymentApi.createOrder({
          productType,
          amountFen: AMOUNT_FEN,
          payMode,
          clientType: ua.clientType,
          uaContext: ua.uaContext,
          channel: 'wechat',
          ua: ua.ua
        });
      } catch (error) {
        alert(error.message || '创建订单失败，请稍后重试');
        return;
      }

      this.activeOrderId = order.orderId;
      this.pollDeadline = Date.now() + 2 * 60 * 1000;

      this.modal.show({
        clientType: ua.clientType,
        uaContext: ua.uaContext,
        amountFen: AMOUNT_FEN,
        order,
        onPay: async () => {
          try {
            await this.handleMobilePay(order, ua);
          } catch (error) {
            this.modal.setStatusText(error.message || '拉起支付失败，请重试');
          }
        },
        onCancel: () => {
          this.clearStatusWatchers();
          this.activeOrderId = '';
        }
      });

      this.modal.setStatusText('订单已创建，请完成支付。');
      this.startStatusWatcher(onPaidDownload);
    }

    async handleMobilePay(order, ua) {
      if (ua.clientType !== 'mobile') {
        return;
      }

      if (!order.h5PayUrl) {
        throw new Error('当前订单缺少H5支付地址');
      }

      global.location.href = order.h5PayUrl;
    }

    async pollPaymentStatusOnce(onPaidDownload) {
      if (!this.activeOrderId) {
        return;
      }

      if (!this.usePollingFallback) {
        return;
      }

      if (this.pollingInFlight) {
        return;
      }

      this.pollingInFlight = true;

      if (Date.now() > this.pollDeadline) {
        this.modal.setStatusText('支付等待超时，请重新发起下载。');
        this.clearStatusWatchers();
        this.activeOrderId = '';
        this.pollingInFlight = false;
        return;
      }

      try {
        const statusResponse = await PaymentApi.queryOrderStatus(this.activeOrderId);
        if (statusResponse.status === ORDER_STATUS.SUCCESS) {
          this.markPaymentSuccess(onPaidDownload);
          return;
        }

        if (this.handleTerminalStatus(statusResponse.status)) {
          this.pollingInFlight = false;
          return;
        }
      } catch (error) {
        this.modal.setStatusText('支付状态查询失败，正在重试...');
      }
      this.pollingInFlight = false;
    }
  }

  global.PaymentRuntime = {
    detectUaContext,
    PaymentFlow
  };
})(window);
