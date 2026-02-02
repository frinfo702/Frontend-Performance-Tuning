const grid = document.getElementById("grid");
const longText =
  "説明文を長くしてレイアウトコストを増やしています。" +
  " テキストを繰り返して DOM の計算量を増やしています。";
const MAX_CARDS = 72;
const BATCH_SIZE = 12;
const cards = [];
const visibleCards = new Set();

const scheduleIdle = (callback) => {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(callback, { timeout: 500 });
  } else {
    setTimeout(() => callback({ timeRemaining: () => 0, didTimeout: true }), 16);
  }
};

const createCard = (index) => {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.index = String(index);
  card.innerHTML = `
    <img src="assets/thumb.svg" alt="商品サムネイル ${index + 1}" loading="lazy" decoding="async" width="400" height="300">
    <h3>商品カード ${index + 1}</h3>
    <p>${longText}</p>
    <p>${longText}</p>
    <p>価格: ¥${(index + 1) * 120}</p>
  `;
  return card;
};

const observer = "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          visibleCards.add(entry.target);
        } else {
          visibleCards.delete(entry.target);
        }
      });
    })
  : null;

const observeCard = (card) => {
  if (observer) {
    observer.observe(card);
  } else {
    visibleCards.add(card);
  }
};

let nextIndex = 0;
const renderBatch = (deadline) => {
  const fragment = document.createDocumentFragment();
  while (nextIndex < MAX_CARDS) {
    const remaining = deadline?.timeRemaining ? deadline.timeRemaining() : 0;
    if (deadline && remaining < 8 && !deadline.didTimeout) {
      break;
    }
    const card = createCard(nextIndex);
    cards.push(card);
    observeCard(card);
    fragment.appendChild(card);
    nextIndex += 1;
    if ((nextIndex + 1) % BATCH_SIZE === 0) {
      break;
    }
  }
  grid.appendChild(fragment);
  if (nextIndex < MAX_CARDS) {
    scheduleIdle(renderBatch);
  }
};

scheduleIdle(renderBatch);
