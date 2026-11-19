const KEY = 'themePreference';
const normalize = value => ['light', 'dark', 'system'].includes(value) ? value : 'system';

export async function initTheme({ document, storage, media }) {
  const select = document.querySelector('#theme-select');
  const status = document.querySelector('#theme-status');
  let preference = 'system';
  let revision = 0;
  const apply = value => {
    preference = normalize(value);
    document.documentElement.dataset.theme = preference === 'system'
      ? (media.matches ? 'dark' : 'light') : preference;
    if (select) select.value = preference;
  };
  apply(preference);
  media.addEventListener('change', () => apply(preference));
  storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !Object.hasOwn(changes, KEY)) return;
    revision++;
    apply(changes[KEY].newValue);
  });
  const initialRevision = revision;
  try {
    const saved = await storage.local.get(KEY);
    if (revision === initialRevision) apply(saved[KEY]);
  } catch {
    status.textContent = 'Không đọc được giao diện đã lưu. Bạn có thể chọn lại bên dưới.';
  }
  if (!select) return;
  select.disabled = false;
  select.addEventListener('change', async () => {
    apply(select.value);
    const selected = preference;
    select.disabled = true;
    try {
      await storage.local.set({ [KEY]: selected });
      status.textContent = 'Đã lưu giao diện cho hồ sơ Chrome này.';
    } catch {
      status.textContent = 'Không lưu được giao diện. Vui lòng chọn lại để thử lưu.';
    } finally {
      select.disabled = false;
    }
  });
}

if (typeof document !== 'undefined') {
  void initTheme({ document, storage: chrome.storage, media: matchMedia('(prefers-color-scheme: dark)') });
}
