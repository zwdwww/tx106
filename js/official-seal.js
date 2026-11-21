/*
 * 律师专用电子签章系统 - 核心功能
 * 版权所有 © 2024 赵卫东
 * 联系方式：13319557755 | 8777817@qq.com
 */

'use strict';

// 全局变量
let canvas, ctx, signaturePad = null, signatureUndoData = [], drawing = false, drawTimer = null, lastDrawTime = 0;
const DRAW_THROTTLE = 50;
const paymentFlow = new window.PaymentRuntime.PaymentFlow();
const WECHAT_BLOCK_MESSAGE = '微信内置浏览器不支持直接下载，请点击右上角并选择在浏览器中打开后再支付下载。';

// 配置对象
const currentConfig = {
  companyName: '联合在线法务有限公司',
  personalName: '武松印章',
  phoneNumber: '13319557755',
  timestamp: '',
  type: 'official'
};

// 缓存
const cache = { elements: new Map(), config: '' };

// 工具函数
const $ = id => document.getElementById(id);
const getEl = id => { if (!cache.elements.has(id)) cache.elements.set(id, $(id)); return cache.elements.get(id); };
const configChanged = () => { const newHash = JSON.stringify(currentConfig); if (cache.config !== newHash) { cache.config = newHash; return true; } return false; };

// 节流绘制
const draw = () => {
  if (!configChanged()) return;
  const now = performance.now();
  if (now - lastDrawTime < DRAW_THROTTLE) {
    clearTimeout(drawTimer);
    drawTimer = setTimeout(performDraw, DRAW_THROTTLE);
    return;
  }
  performDraw();
};
const performDraw = () => {
  if (!drawing) {
    drawing = true;
    lastDrawTime = performance.now();
    requestAnimationFrame(() => { drawSeal(); drawing = false; });
  }
};
const showSuccess = msg => {
  const el = document.createElement('div');
  el.className = 'success-message';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
};
const generateTimestamp = () => {
  const d = new Date();
  currentConfig.timestamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
};

// 配置管理
let saveTimer;
const saveConfig = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem('sealConfig', JSON.stringify({
        companyName: currentConfig.companyName,
        personalName: currentConfig.personalName,
        phoneNumber: currentConfig.phoneNumber,
        type: currentConfig.type
      }));
    } catch (e) {}
  }, 500);
};
const loadConfig = () => {
  try {
    const saved = localStorage.getItem('sealConfig');
    if (saved) {
      const config = JSON.parse(saved);
      Object.assign(currentConfig, config);
      const updates = [
        { el: getEl('companyName'), val: config.companyName },
        { el: getEl('personalName'), val: config.personalName },
        { el: getEl('personalNameRow'), val: config.personalName },
        { el: getEl('phoneNumber'), val: config.phoneNumber },
        { el: getEl('phoneNumberRow'), val: config.phoneNumber }
      ];
      updates.forEach(({ el, val }) => { if (el && val) el.value = val; });
    }
  } catch (e) {}
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  canvas = $('sealCanvas');
  ctx = canvas.getContext('2d');
  refreshSeal();
  generateTimestamp();
  bindEvents();
  updateFormDisplay();
  drawSeal();
  initDownloadCounter();
  loadConfig();
  initSecurity();
});

// 绑定事件
function bindEvents() {
  const inputs = {
    company: getEl('companyName'),
    name: getEl('personalName'),
    nameRow: getEl('personalNameRow'),
    phone: getEl('phoneNumber'),
    phoneRow: getEl('phoneNumberRow')
  };

  if (inputs.company) {
    let timer;
    inputs.company.addEventListener('input', function() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const val = this.value.trim().substring(0, 18);
        if (currentConfig.companyName !== val) {
          currentConfig.companyName = val;
          this.value = val;
          saveConfig();
          draw();
        }
      }, 100);
    });
  }

  const nameHandler = function() {
    const val = this.value.substring(0, 4);
    if (currentConfig.personalName !== val) {
      currentConfig.personalName = val;
      [inputs.name, inputs.nameRow].forEach(el => { if (el && el.value !== val) el.value = val; });
      saveConfig();
      draw();
    }
  };
  [inputs.name, inputs.nameRow].forEach(el => { if (el) el.addEventListener('input', nameHandler); });

  const phoneRegex = /\D/g;
  const phoneHandler = function() {
    const val = this.value.replace(phoneRegex, '').substring(0, 11);
    if (currentConfig.phoneNumber !== val) {
      currentConfig.phoneNumber = val;
      [inputs.phone, inputs.phoneRow].forEach(el => { if (el && el.value !== val) el.value = val; });
      saveConfig();
      draw();
    }
  };
  [inputs.phone, inputs.phoneRow].forEach(el => { if (el) el.addEventListener('input', phoneHandler); });

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); }
    else if (e.key === 'Tab' && !e.target.matches('input')) {
      e.preventDefault();
      const tabs = document.querySelectorAll('.tab-item');
      const idx = Array.from(tabs).findIndex(t => t.classList.contains('tab-active'));
      tabs[(idx + 1) % tabs.length].click();
    }
  });
}

// 印章绘制
function drawSeal() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (currentConfig.type === 'official') drawOfficialSeal();
  else if (currentConfig.type === 'private') drawPrivateSeal();
}

function drawOfficialSeal() {
  const cx = canvas.width / 2, cy = canvas.height / 2 - 14, radius = 109;
  ctx.strokeStyle = ctx.fillStyle = '#d32f2f';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  drawStar(ctx, cx, cy, 31, 5, 0.38);
  drawCircularText(ctx, currentConfig.companyName, cx, cy, radius - 26);
  ctx.save();
  ctx.font = 'bold 17px SimSun, "宋体", STSong';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('电子章'[0], cx - 20, cy + 48);
  ctx.fillText('电子章'[1], cx, cy + 48);
  ctx.fillText('电子章'[2], cx + 20, cy + 48);
  ctx.restore();
  drawArcPhoneNumber(ctx, currentConfig.phoneNumber, cx, cy, radius - 20);
  ctx.save();
  ctx.font = 'bold 25px SimSun, "宋体", STSong';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`时间${currentConfig.timestamp}`, cx, cy + radius + 22);
  ctx.restore();
}

function drawPrivateSeal() {
  const cx = canvas.width / 2, cy = canvas.height / 2 - 19, size = 136;
  ctx.strokeStyle = ctx.fillStyle = '#d32f2f';
  ctx.lineWidth = 12;
  ctx.strokeRect(cx - size / 2, cy - size / 2, size, size);
  const name = processPersonalName(currentConfig.personalName);
  drawGridText(ctx, name, cx, cy - 3);
  ctx.font = 'bold 14px SimSun, "宋体", STSong';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`手机${currentConfig.phoneNumber}`, cx, cy + size / 2 - 14);
  ctx.font = 'bold 22px SimSun, "宋体", STSong';
  ctx.fillText(`时间${currentConfig.timestamp}`, cx, cy + size / 2 + 22);
}

function processPersonalName(name) {
  name = name.trim();
  if (name.length === 2) return name + '印章';
  if (name.length === 3) return name + '章';
  return name.substring(0, 4);
}

function drawGridText(ctx, text, cx, cy) {
  ctx.save();
  ctx.font = 'bold 48px "Microsoft YaHei", "微软雅黑", "黑体", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  text = text.length === 4 ? text : processPersonalName(text);
  const offset = 27;
  const pos = [
    { x: cx + offset, y: cy - offset },
    { x: cx + offset, y: cy + offset },
    { x: cx - offset, y: cy - offset },
    { x: cx - offset, y: cy + offset }
  ];
  for (let i = 0; i < 4; i++) ctx.fillText(text[i], pos[i].x, pos[i].y);
  ctx.restore();
}

function drawStar(ctx, cx, cy, r, points, ir) {
  const ir2 = r * ir, angle = Math.PI / points;
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 2 * points; i++) {
    const radius = i % 2 === 0 ? r : ir2;
    const a = i * angle - Math.PI / 2;
    const x = cx + radius * Math.cos(a), y = cy + radius * Math.sin(a);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCircularText(ctx, text, cx, cy, r) {
  ctx.save();
  const fs = text.length <= 8 ? 26 : text.length <= 12 ? 23 : text.length <= 16 ? 20 : 18;
  ctx.font = `bold ${fs}px SimSun, "宋体", STSong, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const ar = text.length <= 6 ? Math.PI * 1.08 : text.length <= 10 ? Math.PI * 1.15 : text.length <= 14 ? Math.PI * 1.20 : text.length <= 18 ? Math.PI * 1.27 : Math.PI * 1.42;
  const sa = -ar / 2 - Math.PI / 2, as = text.length > 1 ? ar / (text.length - 1) : 0;
  for (let i = 0; i < text.length; i++) {
    const a = sa + i * as, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(text[i], 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

function drawArcPhoneNumber(ctx, phone, cx, cy, r) {
  ctx.save();
  ctx.font = 'bold 11px FangSong, "仿宋", STFangsong, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const ft = `手机${phone}`, ar = Math.PI * 0.4, ca = Math.PI / 2, as = ar / (ft.length - 1), ar2 = r + 1;
  for (let i = 0; i < ft.length; i++) {
    const char = ft[i];
    const a = ca + ar / 2 - i * as, x = cx + ar2 * Math.cos(a), y = cy + ar2 * Math.sin(a);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI / 2 + Math.PI);
    ctx.fillText(char, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

// 下载计数器
function getDownloadCount() {
  try {
    const count = localStorage.getItem('downloadCount');
    return count ? parseInt(count) : 3329;
  } catch { return 3329; }
}
function saveDownloadCount(count) {
  try { localStorage.setItem('downloadCount', count.toString()); } catch {}
}
function incrementDownloadCount() {
  const newCount = getDownloadCount() + 1;
  saveDownloadCount(newCount);
  $('downloadCounter').textContent = newCount;
  return newCount;
}
function initDownloadCounter() {
  $('downloadCounter').textContent = getDownloadCount();
}

// 微信环境
const isWeChat = () => /micromessenger/i.test(navigator.userAgent);
const downloadWithWeChat = (canvas, filename) => {
  if (!canvas) return false;
  try {
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
    return true;
  } catch (e) { return false; }
};

// 操作函数
function refreshSeal() {
  if (currentConfig.type === 'official') {
    currentConfig.companyName = '联合在线法务有限公司';
    $('companyName').value = currentConfig.companyName;
  } else if (currentConfig.type === 'private') {
    currentConfig.personalName = '武松印章';
    const nameInput = $('personalName'), nameRowInput = $('personalNameRow');
    if (nameInput) nameInput.value = currentConfig.personalName;
    if (nameRowInput) nameRowInput.value = currentConfig.personalName;
  }
  currentConfig.phoneNumber = '13319557755';
  const phoneInput = $('phoneNumber'), phoneRowInput = $('phoneNumberRow');
  if (phoneInput) phoneInput.value = currentConfig.phoneNumber;
  if (phoneRowInput) phoneRowInput.value = currentConfig.phoneNumber;
  generateTimestamp();
  drawSeal();
}

function switchTab(type, event) {
  currentConfig.type = type;
  document.querySelectorAll('.tab-item').forEach(tab => tab.classList.remove('tab-active'));
  if (event && event.target) event.target.classList.add('tab-active');
  const sp = $('sealPreview'), fs = $('formSection'), sa = $('sealActions'), sw = $('signatureCanvasWrapper'), su = $('signatureActions');
  if (type === 'signature') {
    sp.style.display = 'none';
    fs.style.display = 'none';
    sa.style.display = 'none';
    sw.style.display = 'block';
    su.style.display = 'flex';
    initSignaturePad();
  } else {
    sp.style.display = 'flex';
    fs.style.display = 'block';
    sa.style.display = 'flex';
    sw.style.display = 'none';
    su.style.display = 'none';
    refreshSeal();
    updateFormDisplay();
  }
}

function updateFormDisplay() {
  const fc = document.querySelector('.form-item-company'), fn = document.querySelector('.form-item-name'), fr = document.querySelector('.form-item-row'), fp = document.querySelector('.form-item:not(.form-item-company):not(.form-item-name):not(.form-item-row)');
  if (currentConfig.type === 'official') {
    if (fc) fc.style.display = 'flex';
    if (fn) fn.style.display = 'none';
    if (fr) fr.style.display = 'none';
    if (fp) fp.style.display = 'flex';
  } else if (currentConfig.type === 'private') {
    if (fc) fc.style.display = 'none';
    if (fn) fn.style.display = 'none';
    if (fr) fr.style.display = 'flex';
    if (fp) fp.style.display = 'none';
  }
}

// 手写签名
function initSignaturePad() {
  if (signaturePad) { resizeSignatureCanvas(); return; }
  const sc = $('signatureCanvas');
  if (!sc) return;
  signaturePad = new window.SignaturePad(sc, { backgroundColor: 'rgb(255, 255, 255)', penColor: 'rgb(0, 0, 0)' });
  signaturePad.addEventListener('endStroke', () => signatureUndoData = []);
  resizeSignatureCanvas();
}

function resizeSignatureCanvas() {
  const sc = $('signatureCanvas');
  if (!sc) return;
  const r = Math.max(window.devicePixelRatio || 1, 1);
  sc.width = sc.offsetWidth * r;
  sc.height = sc.offsetHeight * r;
  sc.getContext('2d').scale(r, r);
  if (signaturePad) signaturePad.clear();
}

function clearSignature() {
  if (signaturePad) { signaturePad.clear(); signatureUndoData = []; }
}

function undoSignature() {
  if (!signaturePad) return;
  const data = signaturePad.toData();
  if (data && data.length > 0) {
    signatureUndoData.push(data.pop());
    signaturePad.fromData(data);
  }
}

window.addEventListener('resize', () => {
  if (currentConfig.type === 'signature' && signaturePad) resizeSignatureCanvas();
});

// 下载功能
function triggerSealDownload() {
  if (isWeChat()) {
    alert(WECHAT_BLOCK_MESSAGE);
    return;
  }

  const canvas = $('sealCanvas');
  if (!canvas) return;
  const ts = new Date().getTime();
  const fn = currentConfig.type === 'official' ? `电子公章_${currentConfig.companyName}_${ts}.png` : `电子私章_${currentConfig.personalName}_${ts}.png`;
  if (downloadWithWeChat(canvas, fn)) {
    incrementDownloadCount();
    showSuccess('印章下载成功！');
  } else {
    alert('下载失败，请重试');
  }
}

function triggerSignatureDownload() {
  if (isWeChat()) {
    alert(WECHAT_BLOCK_MESSAGE);
    return;
  }

  const canvas = $('signatureCanvas');
  if (!canvas || !signaturePad) return;
  if (signaturePad.isEmpty()) { alert('请先签名！'); return; }
  const fn = `手写签名_${new Date().getTime()}.png`;
  if (downloadWithWeChat(canvas, fn)) {
    incrementDownloadCount();
    showSuccess('签名下载成功！');
  } else {
    alert('下载失败，请重试');
  }
}

function downloadSeal() {
  paymentFlow.start(currentConfig.type === 'official' ? 'officialSeal' : 'privateSeal', triggerSealDownload);
}

function downloadSignature() {
  paymentFlow.start('signature', triggerSignatureDownload);
}

// 安全防护
function initSecurity() {
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('dragstart', e => {
    if (e.target.tagName === 'IMG' || e.target.tagName === 'CANVAS') e.preventDefault();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'F12' || (e.ctrlKey && e.key === 'u') ||
        (e.ctrlKey && e.shiftKey && e.key === 'I') ||
        (e.ctrlKey && e.shiftKey && e.key === 'C')) {
      e.preventDefault();
    }
  });
  setInterval(() => {
    const seal = $('sealCanvas');
    if (seal) {
      seal.style.pointerEvents = 'none';
      seal.style.userSelect = 'none';
    }
  }, 1000);
}
