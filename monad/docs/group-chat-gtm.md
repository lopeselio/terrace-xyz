# Group chats: what to measure

Goal: group-chat banter turns into Terrace markets, and the chats bring in new fans who stay.

| Metric | Definition | Source |
|---|---|---|
| Chats with the bot | Distinct Telegram chats with at least one take card in the period | bot `pending.chat_id` |
| Active chats | Chats with at least one market opened (a take someone backed or faded) in the period | bot `chat_markets` |
| Markets per chat | Markets opened ÷ active chats, per week | bot `chat_markets` |
| Take → market rate | Take cards that got a market ÷ take cards posted | bot `pending.market_id` |
| First-time players per chat | Fans whose first-ever Terrace bet was on a group take, grouped by the take's chat | indexer `Market.fromGroup` + `Player.firstSeen` joined to bot `chat_markets` |
| D7 retention of chat-acquired players | Share of those fans with any points event 7–13 days after their first bet | indexer `PointsEvent` |
| Share-card taps | `/b/<market>` visits with `via=share` that reach the bet sheet | app analytics (GA) |

Baselines to beat: compare D7 for chat-acquired fans with fans who arrived through 1v1 and league links
(`INVITE` points from `TerraceMatchups` / `TerraceLeagues`).

Watch for: chats where one person posts every take (no conversation), and takes that compile to the AI
judge rather than a data rule (slower settlement, weaker loop).
