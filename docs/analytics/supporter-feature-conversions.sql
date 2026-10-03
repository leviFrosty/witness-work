-- Custom definition; governed catalog consulted: no match.
-- Correlated by anonymous installation + gate_flow_id; 7-day ordered conversion.
WITH source_events AS (
  SELECT
    distinct_id,
    event,
    timestamp,
    properties.feature AS feature,
    properties.source_screen AS source_screen,
    properties.gate_surface AS gate_surface,
    properties.gate_flow_id AS gate_flow_id,
    properties.tier AS tier,
    properties.source AS source
  FROM events
  WHERE {filters}
    AND properties.app_variant = 'production'
    AND properties.development_mode = false
    AND properties.$is_emulator = false
    AND properties.gate_flow_id IS NOT NULL
    AND properties.gate_flow_id != ''
    AND event IN (
      'supporter_feature_gate_viewed', 'supporter_feature_gate_clicked',
      'supporter_gate_viewed', 'supporter_gate_clicked', 'paywall_viewed',
      'supporter_purchase_started', 'supporter_purchase_completed'
    )
), flow_times AS (
  SELECT distinct_id, feature, source_screen, gate_surface, gate_flow_id,
    minIf(toUnixTimestamp(timestamp), event = 'supporter_feature_gate_viewed') AS viewed_at,
    minIf(toUnixTimestamp(timestamp), event = 'supporter_feature_gate_clicked') AS clicked_at,
    minIf(toUnixTimestamp(timestamp), event = 'supporter_gate_viewed') AS sheet_at,
    minIf(toUnixTimestamp(timestamp), event = 'supporter_gate_clicked') AS cta_at,
    minIf(toUnixTimestamp(timestamp), event = 'paywall_viewed') AS paywall_at,
    minIf(toUnixTimestamp(timestamp), event = 'supporter_purchase_started' AND tier = 'supporter') AS checkout_at,
    minIf(toUnixTimestamp(timestamp), event = 'supporter_purchase_completed' AND tier = 'supporter' AND source = 'feature_gate') AS purchased_at
  FROM source_events
  GROUP BY distinct_id, feature, source_screen, gate_surface, gate_flow_id
), gate_flows AS (
  SELECT *,
    multiIf(
      purchased_at >= checkout_at AND checkout_at >= paywall_at AND paywall_at >= cta_at AND cta_at >= sheet_at AND sheet_at >= clicked_at AND clicked_at >= viewed_at AND purchased_at <= viewed_at + 604800, 7,
      checkout_at >= paywall_at AND paywall_at >= cta_at AND cta_at >= sheet_at AND sheet_at >= clicked_at AND clicked_at >= viewed_at AND checkout_at <= viewed_at + 604800, 6,
      paywall_at >= cta_at AND cta_at >= sheet_at AND sheet_at >= clicked_at AND clicked_at >= viewed_at AND paywall_at <= viewed_at + 604800, 5,
      cta_at >= sheet_at AND sheet_at >= clicked_at AND clicked_at >= viewed_at AND cta_at <= viewed_at + 604800, 4,
      sheet_at >= clicked_at AND clicked_at >= viewed_at AND sheet_at <= viewed_at + 604800, 3,
      clicked_at >= viewed_at AND clicked_at <= viewed_at + 604800, 2,
      1
    ) AS completed_step
  FROM flow_times
  WHERE viewed_at > 0
)
SELECT
  feature AS Feature,
  source_screen AS Screen,
  gate_surface AS Placement,
  uniq(distinct_id) AS Viewers,
  uniqIf(distinct_id, completed_step >= 2) AS Tapped,
  uniqIf(distinct_id, completed_step >= 3) AS Sheet_viewers,
  uniqIf(distinct_id, completed_step >= 5) AS Paywall_viewers,
  uniqIf(distinct_id, completed_step >= 6) AS Checkout_starts,
  uniqIf(distinct_id, completed_step = 7) AS Supporter_purchasers,
  Supporter_purchasers / nullIf(Viewers, 0) AS View_to_purchase,
  Supporter_purchasers / nullIf(Tapped, 0) AS Tap_to_purchase,
  Supporter_purchasers / nullIf(Checkout_starts, 0) AS Checkout_to_purchase
FROM gate_flows
GROUP BY feature, source_screen, gate_surface
ORDER BY View_to_purchase DESC, Supporter_purchasers DESC, Viewers DESC
LIMIT 100
