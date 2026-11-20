# Chrome Web Store submission — 0.2.3

## Tiếng Việt

Tên: Nhắc tra cứu phạt nguội

Mô tả ngắn: Theo dõi tra cứu phạt nguội tham khảo từ VNeTraffic.org mỗi ngày, lưu dữ liệu trên máy và báo khi kết quả thay đổi.

Mô tả đầy đủ:

Lưu danh sách ô tô, xe máy và xe đạp điện để theo dõi kết quả tra cứu tham khảo
tại một nơi. Dữ liệu phương tiện và lịch sử được lưu trong hồ sơ Chrome trên máy.

- Cập nhật khi mở Chrome hoặc tiện ích và kiểm tra ngày mới bằng lịch nền.
- Mỗi xe tự thử một lần/ngày; lỗi chờ bạn bấm Thử lại. Không kiểm tra bù ngày tắt máy.
- Tra cứu thủ công không giới hạn lượt; khi cập nhật sẽ mở rồi đóng một tab nguồn nền.
- Hiển thị nguồn, ngày dữ liệu, lần thử và thành công gần nhất; giữ kết quả cũ khi lỗi.
- Thông báo khi có vi phạm mới hoặc thay đổi; có thể tạm dừng tự động cập nhật.
- Giao diện sáng/tối, xuất JSON và xóa dữ liệu cục bộ.

Không phải sản phẩm của Cục CSGT, VNeTraffic hay cơ quan nhà nước; không liên kết
hoặc được các đơn vị này bảo trợ. VNeTraffic.org là website độc lập, chỉ cung cấp
dữ liệu tham khảo. Hãy đối chiếu kết quả chính thức trên ứng dụng VNeTraffic hoặc
cổng CSGT. Không bảo đảm dữ liệu luôn đầy đủ, mới nhất hay nguồn luôn truy cập được.
Ảnh store dùng biển số giả và dữ liệu minh họa, không phải bằng chứng tra cứu thật.

## English

Name: Nhắc tra cứu phạt nguội

Short description: Track daily reference traffic-fine lookups from VNeTraffic.org, keep results locally and receive change notifications.

Full description:

Keep cars, motorcycles and electric bicycles in one local vehicle list to follow
reference traffic-fine lookup results. Vehicle data and history stay in your
Chrome profile, with no cloud synchronization.

- Checks on Chrome/extension opening and a background schedule for a new day.
- One automatic attempt per vehicle per day; errors wait for a manual retry.
- Unlimited manual checks. Each lookup opens and closes a temporary source tab.
- Source, data date, last attempt and last success are shown; errors preserve older results.
- Change notifications, pause controls, light/dark themes, JSON export and local deletion.

Chrome may delay background work; nothing runs while Chrome is closed or your
computer sleeps. Missed days are not replayed. This extension is independent of
Vietnamese government agencies, CSGT and VNeTraffic and is not endorsed by them.
VNeTraffic.org is an independent reference website. Verify official results in
the VNeTraffic app or CSGT portal. Availability, completeness and freshness are
not guaranteed. Store screenshots contain fake plates and illustrative local data.

## Single purpose / Mục đích duy nhất

Keep a local vehicle list and check reference traffic-fine results daily, with
notifications when those results change.

## Quyền tối thiểu / Permission justifications

| Quyền | Lý do / Justification |
| --- | --- |
| storage | Store vehicle list, daily attempt budget, results, settings, theme and diagnostics locally; session storage coordinates temporary source tabs. No sync. |
| alarms | Wake the service worker to check whether a new local day needs an update. Not a guarantee of exact execution time. |
| notifications | Display a system notification when a vehicle's violation results change. Controlled by the user's notification setting. |
| https://vnetraffic.org/* | Load the lookup page and use its same-origin lookup API. No access to unrelated hosts. |

Content script is restricted to the exact lookup page, top frame only. All
scripts are packaged. No remote executable code, eval, tabs, scripting, activeTab,
webRequest, history, cookies or broad all-sites permission. chrome.tabs create,
remove and basic lifecycle operations used here do not require the tabs permission;
the extension does not need access to arbitrary sensitive tab properties.
The host grant covers both the lookup page and API; the script match is narrower.

## Privacy practices for the dashboard

Disclose the transmission of user-entered plates and vehicle type to the third-party
lookup source. Do not claim that all processing is offline. Local nicknames,
settings, history and diagnostics are not sent by the extension. No developer
analytics, advertising, sale, credit scoring, unrelated use or remote code.
Review the dashboard's current data categories against this behavior; describe
vehicle identifiers in its applicable user-data field rather than declaring no
data merely because the developer has no server. Use the policy in PRIVACY.md.

## Manual submission checklist

1. Run `npm ci`, `npm run build`, `npm test`, `npm run test:coverage` and `npm run store:assets`.
2. Upload `dist/tra-cuu-phat-nguoi-0.2.3.zip`. Runtime only: manifest, src, icons and LICENSE.
3. Upload `icons/icon128.png`, `store/01-dashboard.png`, `02-dark.png`, `03-add-vehicle.png`, and `promo-440x280.png`.
4. Select Vietnamese as the primary language and Productivity as the category. Paste the VI and EN full descriptions together into the primary listing's description field. The product UI is Vietnamese. This package has no `_locales` directories, so it does not expose a separate EN translation in the dashboard; the EN copy above is ready for the bilingual description. Separate translated listings require a future package with localized manifest metadata and matching `_locales` resources.
5. Publish PRIVACY.md at a stable publicly accessible HTTPS URL and enter that URL in the dashboard. Set a real publisher support contact/link. These account-owned values are not fabricated in this repository.
6. Fill privacy practices and permission reasons above, verify publisher/account/distribution details, preview images, then submit manually.
7. Review donation configuration before release (currently empty, no payment account configured).

Assets are regenerated using Playwright with the actual unpacked extension, a
fresh disposable profile inside the repo, paused fixtures and blocked HTTP(S).
`assets.json` records dimensions and browser version. They do not validate live
source availability. The promo tile is an original code-rendered composition
using the existing project icon. Runtime has no dependency on Playwright.

Official requirements: [images](https://developer.chrome.com/docs/webstore/images),
[listing](https://developer.chrome.com/docs/webstore/cws-dashboard-listing),
[privacy disclosures](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).
