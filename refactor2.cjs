const fs = require('fs');
let content = fs.readFileSync('src/utils/matchEngine.ts', 'utf-8');

// Increase match event frequency (0.08 -> 0.10) for more elasticity
content = content.replace(/if \(Math\.random\(\) < 0\.08\)/g, "if (Math.random() < 0.10)");

// Increase base conversion rates (0.28 -> 0.35, 0.55 -> 0.60, 0.5 -> 0.55)
content = content.replace(/if \(attackRoll < attackChance \* 0\.28\)/g, "if (attackRoll < attackChance * 0.35)");
content = content.replace(/else if \(attackRoll < attackChance \* 0\.55\)/g, "else if (attackRoll < attackChance * 0.60)");
content = content.replace(/else if \(attackRoll < attackChance \* 0\.5\)/g, "else if (attackRoll < attackChance * 0.55)");


// Apply dynamic scaling logic before the match loop
const oldScaling = `// Blowout / Goleada chance check (5% chance to trigger extra attack strength if one team takes a 2-goal lead)
  let blowoutTriggered = false;`;

const newScaling = `// Elastic Goal Scaling: 
  // If attack is 30% higher than defense, boost scoring rate.
  let homeConversionRate = 0.35;
  let awayConversionRate = 0.35;
  
  if (homeAtt >= awayDef * 1.3) {
    homeConversionRate += 0.08;
  }
  if (awayDef <= homeAtt * 0.7) {
    homeConversionRate += 0.08;
  }
  
  if (awayAtt >= homeDef * 1.3) {
    awayConversionRate += 0.08;
  }
  if (homeDef <= awayAtt * 0.7) {
    awayConversionRate += 0.08;
  }

  // Blowout / Goleada chance check (5% chance to trigger extra attack strength if one team takes a 2-goal lead)
  let blowoutTriggered = false;`;

content = content.replace(oldScaling, newScaling);

// Now apply homeConversionRate and awayConversionRate inside the event loop
// We previously replaced 0.28 with 0.35 directly, so let's revert those inside the specific branches, or just use regex carefully.
// Wait, I can just replace `attackChance * 0.35` with `attackChance * homeConversionRate` for home, and awayConversionRate for away.
// Let's do a more precise replacement.

content = fs.readFileSync('src/utils/matchEngine.ts', 'utf-8');

// 1. More elastic frequency
content = content.replace(/if \(Math\.random\(\) < 0\.08\)/g, "if (Math.random() < 0.11)");

// 2. Insert newScaling
content = content.replace(oldScaling, newScaling);

// 3. Replace conversion in Home Attack
content = content.replace(
  /if \(attackRoll < attackChance \* 0\.28\) \{ \/\/ Increased base conversion for higher force gap\n\s*homeScore\+\+;/g,
  "if (attackRoll < attackChance * homeConversionRate) { // Elastic conversion applied\\n          homeScore++;"
);

// 4. Replace conversion in Away Attack
content = content.replace(
  /if \(attackRoll < attackChance \* 0\.28\) \{ \/\/ Goal!\n\s*awayScore\+\+;/g,
  "if (attackRoll < attackChance * awayConversionRate) { // Goal!\\n          awayScore++;"
);

// Write back
fs.writeFileSync('src/utils/matchEngine.ts', content);
console.log("matchEngine updated");
