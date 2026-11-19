import { donationMethods } from './donate-config.js';

const container = document.getElementById('donation-methods');
const addText = (parent, tag, value, className) => {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  parent.append(node);
  return node;
};

for (const method of donationMethods) {
  if (!method.title || !(method.details || method.url || method.qr)) continue;
  const card = document.createElement('article');
  card.className = 'donation-card';
  addText(card, 'p', method.label || 'ỦNG HỘ', 'eyebrow');
  addText(card, 'h3', method.title);
  if (method.description) addText(card, 'p', method.description, 'donation-description');
  if (method.details) addText(card, 'p', method.details, 'donation-details');
  if (method.qr && /^\.\.\/icons\/[\w./-]+\.(?:png|jpg|jpeg|webp)$/i.test(method.qr) && !method.qr.includes('..', 3)) {
    const img = document.createElement('img');
    img.src = method.qr;
    img.alt = `Mã QR ${method.title}`;
    img.className = 'donation-qr';
    card.append(img);
  }
  if (method.url) {
    try {
      const url = new URL(method.url);
      if (url.protocol === 'https:') {
        const link = addText(card, 'a', method.linkText || 'Mở trang ủng hộ ↗', 'donation-link');
        link.href = url.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
    } catch { /* Bỏ qua liên kết không hợp lệ. */ }
  }
  container.append(card);
}
document.getElementById('donation-empty').hidden = container.childElementCount > 0;
