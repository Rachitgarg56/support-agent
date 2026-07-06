*(An instructions file embedded inside Scrimba’s iconic React capstone game project module)*

```markdown
# Challenge: Tenzies Game Logic 🎲

Your goal is to build a fully operational browser-based Tenzies dice game using React state hooks and side effects.

## 🏆 Win Criteria
1. All 10 dice elements on the screen must display the exact same number value.
2. All 10 individual dice components must be actively locked in their held state (`isHeld: true`).

## 🧱 Component State Mapping

```javascript
// Each die item should mirror this specific metadata object
{
  id: "unique-nanoid-string",
  value: 4, // Random integer between 1 and 6
  isHeld: false
}s