# tx106

119.29.163.106 站点（115电子公章 / 电子私章 / 手写签名）的静态前端快照，用于 GitHub Pages 预览。

## 内容
- `index.html` 首页
- `css/official-seal.css` 样式
- `js/official-seal.js` 印章生成逻辑
- `js/payment-checkout.js` 支付页逻辑
- `js/runtime-config.js` 接口地址配置

## 说明
原站还有 PHP 后台（dzqz.55115.cn）、MySQL 与支付后端（18080），这些不包含在本仓库，也无法运行在 GitHub Pages。
页面内 `api/payments` 为相对路径，Pages 上没有后端，涉及下单/支付的接口会 404。
线上完整站点：https://55115.cn
