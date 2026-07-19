const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf-8');

// 1. Update tactic type and initial value
content = content.replace(
  /useState<'4-4-2' \| '4-3-3' \| '3-5-2' \| '4-5-1' \| '5-3-2'>\('4-4-2'\);/g,
  "useState<'4-2-3-1' | '3-4-3' | '4-5-1' | '4-4-2 (Diamond)' | '4-3-3' | '4-4-1-1' | '3-3-1-3' | '4-4-2' | '3-5-2'>('4-4-2');"
);

// 2. Update Tactic Tabs
content = content.replace(
  /\(\['4-4-2', '4-3-3', '3-5-2', '4-5-1', '5-3-2'\] as const\)\.map/g,
  "(['4-2-3-1', '3-4-3', '4-5-1', '4-4-2 (Diamond)', '4-3-3', '4-4-1-1', '3-3-1-3', '4-4-2', '3-5-2'] as const).map"
);

// 3. Update getTacticNeeds function
// We will replace the whole getTacticNeeds function definition inside `useEffect` on line 120
const oldGetTacticNeeds = `const getTacticNeeds = (tactic: string) => {
        let targetDF = 4, targetMF = 4, targetFW = 2;
        if (tactic === '4-3-3') { targetDF = 4; targetMF = 3; targetFW = 3; }
        else if (tactic === '3-5-2') { targetDF = 3; targetMF = 5; targetFW = 2; }
        else if (tactic === '4-5-1') { targetDF = 4; targetMF = 5; targetFW = 1; }
        else if (tactic === '5-3-2') { targetDF = 5; targetMF = 3; targetFW = 2; }
        return { targetDF, targetMF, targetFW };
      };`;

const newGetTacticNeeds = `const getTacticNeeds = (tactic: string) => {
        let targetZAG = 2, targetLE = 1, targetLD = 1, targetMEI = 4, targetATA = 2;
        if (tactic === '4-2-3-1' || tactic === '4-5-1' || tactic === '4-4-1-1') {
          targetZAG = 2; targetLE = 1; targetLD = 1; targetMEI = 5; targetATA = 1;
        } else if (tactic === '4-3-3') {
          targetZAG = 2; targetLE = 1; targetLD = 1; targetMEI = 3; targetATA = 3;
        } else if (tactic === '4-4-2' || tactic === '4-4-2 (Diamond)') {
          targetZAG = 2; targetLE = 1; targetLD = 1; targetMEI = 4; targetATA = 2;
        } else if (tactic === '3-4-3' || tactic === '3-3-1-3') {
          targetZAG = 3; targetLE = 1; targetLD = 1; targetMEI = 2; targetATA = 3;
        } else if (tactic === '3-5-2') {
          targetZAG = 3; targetLE = 1; targetLD = 1; targetMEI = 3; targetATA = 2;
        }
        return { targetZAG, targetLE, targetLD, targetMEI, targetATA };
      };`;

content = content.replace(oldGetTacticNeeds, newGetTacticNeeds);

// 4. Update Auto-pick in useEffect
const oldAutoPick = `const gks = userClub.squad.filter(p => p.position === 'GK' && !p.isInjured).sort((a, b) => b.rating - a.rating);
        const dfs = userClub.squad.filter(p => p.position === 'DF' && !p.isInjured).sort((a, b) => b.rating - a.rating);
        const mfs = userClub.squad.filter(p => p.position === 'MF' && !p.isInjured).sort((a, b) => b.rating - a.rating);
        const fws = userClub.squad.filter(p => p.position === 'FW' && !p.isInjured).sort((a, b) => b.rating - a.rating);

        const selected: Player[] = [];
        if (gks[0]) selected.push(gks[0]);
        for (let i = 0; i < Math.min(targetDF, dfs.length); i++) selected.push(dfs[i]);
        for (let i = 0; i < Math.min(targetMF, mfs.length); i++) selected.push(mfs[i]);
        for (let i = 0; i < Math.min(targetFW, fws.length); i++) selected.push(fws[i]);`;

const newAutoPick = `const pool = [...userClub.squad].filter(p => !p.isInjured).sort((a, b) => b.rating - a.rating);
        const selected: Player[] = [];
        const gks = pool.filter(p => p.subPosition === 'GK');
        if (gks[0]) selected.push(gks[0]);

        const zags = pool.filter(p => p.subPosition === 'ZAG');
        const les = pool.filter(p => p.subPosition === 'LE');
        const lds = pool.filter(p => p.subPosition === 'LD');
        const meis = pool.filter(p => p.subPosition === 'MEI');
        const atas = pool.filter(p => p.subPosition === 'ATA');

        for (let i = 0; i < Math.min(targetZAG, zags.length); i++) selected.push(zags[i]);
        for (let i = 0; i < Math.min(targetLE, les.length); i++) selected.push(les[i]);
        for (let i = 0; i < Math.min(targetLD, lds.length); i++) selected.push(lds[i]);
        for (let i = 0; i < Math.min(targetMEI, meis.length); i++) selected.push(meis[i]);
        for (let i = 0; i < Math.min(targetATA, atas.length); i++) selected.push(atas[i]);`;

content = content.replace(oldAutoPick, newAutoPick);

// Now do the same for the buttons: "Escalar Melhores" and "Poupar Cansados"
// 5. Escalar Melhores
const oldEscalarMelhores = `let targetDF = 4, targetMF = 4, targetFW = 2;
                    if (selectedTactic === '4-3-3') { targetDF = 4; targetMF = 3; targetFW = 3; }
                    else if (selectedTactic === '3-5-2') { targetDF = 3; targetMF = 5; targetFW = 2; }
                    else if (selectedTactic === '4-5-1') { targetDF = 4; targetMF = 5; targetFW = 1; }
                    else if (selectedTactic === '5-3-2') { targetDF = 5; targetMF = 3; targetFW = 2; }

                    const gks = userClub.squad.filter(p => p.position === 'GK' && !p.isInjured).sort((a, b) => b.rating - a.rating);
                    const dfs = userClub.squad.filter(p => p.position === 'DF' && !p.isInjured).sort((a, b) => b.rating - a.rating);
                    const mfs = userClub.squad.filter(p => p.position === 'MF' && !p.isInjured).sort((a, b) => b.rating - a.rating);
                    const fws = userClub.squad.filter(p => p.position === 'FW' && !p.isInjured).sort((a, b) => b.rating - a.rating);

                    const bestSelected: Player[] = [];
                    if (gks[0]) bestSelected.push(gks[0]);
                    for (let i = 0; i < Math.min(targetDF, dfs.length); i++) bestSelected.push(dfs[i]);
                    for (let i = 0; i < Math.min(targetMF, mfs.length); i++) bestSelected.push(mfs[i]);
                    for (let i = 0; i < Math.min(targetFW, fws.length); i++) bestSelected.push(fws[i]);`;

const newEscalarMelhores = `let targetZAG = 2, targetLE = 1, targetLD = 1, targetMEI = 4, targetATA = 2;
                    if (selectedTactic === '4-2-3-1' || selectedTactic === '4-5-1' || selectedTactic === '4-4-1-1') {
                      targetZAG = 2; targetLE = 1; targetLD = 1; targetMEI = 5; targetATA = 1;
                    } else if (selectedTactic === '4-3-3') {
                      targetZAG = 2; targetLE = 1; targetLD = 1; targetMEI = 3; targetATA = 3;
                    } else if (selectedTactic === '4-4-2' || selectedTactic === '4-4-2 (Diamond)') {
                      targetZAG = 2; targetLE = 1; targetLD = 1; targetMEI = 4; targetATA = 2;
                    } else if (selectedTactic === '3-4-3' || selectedTactic === '3-3-1-3') {
                      targetZAG = 3; targetLE = 1; targetLD = 1; targetMEI = 2; targetATA = 3;
                    } else if (selectedTactic === '3-5-2') {
                      targetZAG = 3; targetLE = 1; targetLD = 1; targetMEI = 3; targetATA = 2;
                    }

                    const pool = [...userClub.squad].filter(p => !p.isInjured).sort((a, b) => b.rating - a.rating);
                    const bestSelected: Player[] = [];
                    const gks = pool.filter(p => p.subPosition === 'GK');
                    if (gks[0]) bestSelected.push(gks[0]);

                    const zags = pool.filter(p => p.subPosition === 'ZAG');
                    const les = pool.filter(p => p.subPosition === 'LE');
                    const lds = pool.filter(p => p.subPosition === 'LD');
                    const meis = pool.filter(p => p.subPosition === 'MEI');
                    const atas = pool.filter(p => p.subPosition === 'ATA');

                    for (let i = 0; i < Math.min(targetZAG, zags.length); i++) bestSelected.push(zags[i]);
                    for (let i = 0; i < Math.min(targetLE, les.length); i++) bestSelected.push(les[i]);
                    for (let i = 0; i < Math.min(targetLD, lds.length); i++) bestSelected.push(lds[i]);
                    for (let i = 0; i < Math.min(targetMEI, meis.length); i++) bestSelected.push(meis[i]);
                    for (let i = 0; i < Math.min(targetATA, atas.length); i++) bestSelected.push(atas[i]);`;

content = content.replace(oldEscalarMelhores, newEscalarMelhores);


// 6. Poupar Cansados
const oldPoupar = `let targetDF = 4, targetMF = 4, targetFW = 2;
                    if (selectedTactic === '4-3-3') { targetDF = 4; targetMF = 3; targetFW = 3; }
                    else if (selectedTactic === '3-5-2') { targetDF = 3; targetMF = 5; targetFW = 2; }
                    else if (selectedTactic === '4-5-1') { targetDF = 4; targetMF = 5; targetFW = 1; }
                    else if (selectedTactic === '5-3-2') { targetDF = 5; targetMF = 3; targetFW = 2; }

                    // Sort all non-injured squad by energy level (higher energy first), then by rating
                    const pool = [...userClub.squad].filter(p => !p.isInjured).sort((a, b) => b.energy - a.energy || b.rating - a.rating);
                    
                    const selected: Player[] = [];
                    // Force pick the gk with best energy
                    const gks = pool.filter(p => p.position === 'GK');
                    if (gks[0]) selected.push(gks[0]);

                    const dfs = pool.filter(p => p.position === 'DF');
                    for (let i = 0; i < Math.min(targetDF, dfs.length); i++) selected.push(dfs[i]);

                    const mfs = pool.filter(p => p.position === 'MF');
                    for (let i = 0; i < Math.min(targetMF, mfs.length); i++) selected.push(mfs[i]);

                    const fws = pool.filter(p => p.position === 'FW');
                    for (let i = 0; i < Math.min(targetFW, fws.length); i++) selected.push(fws[i]);`;

const newPoupar = `let targetZAG = 2, targetLE = 1, targetLD = 1, targetMEI = 4, targetATA = 2;
                    if (selectedTactic === '4-2-3-1' || selectedTactic === '4-5-1' || selectedTactic === '4-4-1-1') {
                      targetZAG = 2; targetLE = 1; targetLD = 1; targetMEI = 5; targetATA = 1;
                    } else if (selectedTactic === '4-3-3') {
                      targetZAG = 2; targetLE = 1; targetLD = 1; targetMEI = 3; targetATA = 3;
                    } else if (selectedTactic === '4-4-2' || selectedTactic === '4-4-2 (Diamond)') {
                      targetZAG = 2; targetLE = 1; targetLD = 1; targetMEI = 4; targetATA = 2;
                    } else if (selectedTactic === '3-4-3' || selectedTactic === '3-3-1-3') {
                      targetZAG = 3; targetLE = 1; targetLD = 1; targetMEI = 2; targetATA = 3;
                    } else if (selectedTactic === '3-5-2') {
                      targetZAG = 3; targetLE = 1; targetLD = 1; targetMEI = 3; targetATA = 2;
                    }

                    // Sort all non-injured squad by energy level (higher energy first), then by rating
                    const pool = [...userClub.squad].filter(p => !p.isInjured).sort((a, b) => b.energy - a.energy || b.rating - a.rating);
                    
                    const selected: Player[] = [];
                    // Force pick the gk with best energy
                    const gks = pool.filter(p => p.subPosition === 'GK');
                    if (gks[0]) selected.push(gks[0]);

                    const zags = pool.filter(p => p.subPosition === 'ZAG');
                    const les = pool.filter(p => p.subPosition === 'LE');
                    const lds = pool.filter(p => p.subPosition === 'LD');
                    const meis = pool.filter(p => p.subPosition === 'MEI');
                    const atas = pool.filter(p => p.subPosition === 'ATA');

                    for (let i = 0; i < Math.min(targetZAG, zags.length); i++) selected.push(zags[i]);
                    for (let i = 0; i < Math.min(targetLE, les.length); i++) selected.push(les[i]);
                    for (let i = 0; i < Math.min(targetLD, lds.length); i++) selected.push(lds[i]);
                    for (let i = 0; i < Math.min(targetMEI, meis.length); i++) selected.push(meis[i]);
                    for (let i = 0; i < Math.min(targetATA, atas.length); i++) selected.push(atas[i]);`;

content = content.replace(oldPoupar, newPoupar);


// 7. Pitch Grid rendering
// FW -> ATA
content = content.replace(
  /starters\.filter\(p => p\.position === 'FW'\)/g,
  "starters.filter(p => p.subPosition === 'ATA')"
);

// MF -> MEI + LE + LD (if 3-DF scheme)
// Let's replace the whole MF row
const oldMFRow = `{/* Midfielders row */}
                <div className="tactical-row">
                  {starters.filter(p => p.position === 'MF').map(p => (
                    <div key={p.id} className="player-token" onClick={() => { setSubslotIndex(starters.indexOf(p)); setSubModalOpen(true); }}>
                      <div className="token-circle" style={{ borderColor: p.isStar ? 'var(--accent-gold)' : 'var(--accent-green)' }}>{p.rating}</div>
                      <span className="token-name">{p.isStar ? '★ ' : ''}{p.name.split(' ')[0]} ({p.age})</span>
                    </div>
                  ))}
                </div>`;

const newMFRow = `{/* Midfielders row */}
                <div className="tactical-row">
                  {starters.filter(p => {
                    const is3DF = selectedTactic.startsWith('3-');
                    if (is3DF) {
                      return p.subPosition === 'MEI' || p.subPosition === 'LE' || p.subPosition === 'LD';
                    }
                    return p.subPosition === 'MEI';
                  }).map(p => (
                    <div key={p.id} className="player-token" onClick={() => { setSubslotIndex(starters.indexOf(p)); setSubModalOpen(true); }}>
                      <div className="token-circle" style={{ borderColor: p.isStar ? 'var(--accent-gold)' : 'var(--accent-green)' }}>{p.rating}</div>
                      <span className="token-name">
                        <strong style={{ color: 'var(--accent-green)', marginRight: '2px' }}>{p.subPosition}</strong> 
                        {p.isStar ? '★ ' : ''}{p.name.split(' ')[0]} ({p.age})
                      </span>
                    </div>
                  ))}
                </div>`;

content = content.replace(oldMFRow, newMFRow);

// DF -> ZAG (and LE/LD if not 3-DF)
const oldDFRow = `{/* Defenders row */}
                <div className="tactical-row">
                  {(() => {
                    const dfs = starters.filter(p => p.position === 'DF');
                    return dfs.map((p, idx) => {
                      // Use assigned subPosition or fallback dynamically to index label
                      let sideLabel = p.subPosition || 'ZAG';
                      if (!p.subPosition) {
                        if (dfs.length === 3) {
                          if (idx === 0) sideLabel = 'LE';
                          if (idx === 2) sideLabel = 'LD';
                        } else if (dfs.length === 4) {
                          if (idx === 0) sideLabel = 'LE';
                          if (idx === 3) sideLabel = 'LD';
                        } else if (dfs.length === 5) {
                          if (idx === 0) sideLabel = 'LE';
                          if (idx === 4) sideLabel = 'LD';
                        }
                      }
                      
                      return (
                        <div key={p.id} className="player-token" onClick={() => { setSubslotIndex(starters.indexOf(p)); setSubModalOpen(true); }}>
                          <div className="token-circle" style={{ borderColor: p.isStar ? 'var(--accent-gold)' : 'var(--accent-blue)' }}>{p.rating}</div>
                          <span className="token-name" style={{ fontSize: '0.62rem' }}>
                            <strong style={{ color: 'var(--accent-blue)', marginRight: '2px' }}>{sideLabel}</strong> 
                            {p.isStar ? '★ ' : ''}{p.name.split(' ')[0]} ({p.age})
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>`;

const newDFRow = `{/* Defenders row */}
                <div className="tactical-row">
                  {(() => {
                    const is3DF = selectedTactic.startsWith('3-');
                    const dfs = starters.filter(p => {
                      if (is3DF) return p.subPosition === 'ZAG';
                      return p.subPosition === 'ZAG' || p.subPosition === 'LE' || p.subPosition === 'LD';
                    });
                    return dfs.map((p, idx) => {
                      let sideLabel = p.subPosition || 'ZAG';
                      return (
                        <div key={p.id} className="player-token" onClick={() => { setSubslotIndex(starters.indexOf(p)); setSubModalOpen(true); }}>
                          <div className="token-circle" style={{ borderColor: p.isStar ? 'var(--accent-gold)' : 'var(--accent-blue)' }}>{p.rating}</div>
                          <span className="token-name" style={{ fontSize: '0.62rem' }}>
                            <strong style={{ color: 'var(--accent-blue)', marginRight: '2px' }}>{sideLabel}</strong> 
                            {p.isStar ? '★ ' : ''}{p.name.split(' ')[0]} ({p.age})
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>`;

content = content.replace(oldDFRow, newDFRow);

// Market view positional filters
content = content.replace(
  /useState<'ALL' \| 'GK' \| 'DF' \| 'MF' \| 'FW'>\('ALL'\)/g,
  "useState<'ALL' | 'GK' | 'ZAG' | 'LE' | 'LD' | 'MEI' | 'ATA'>('ALL')"
);

content = content.replace(
  /\(\['ALL', 'GK', 'DF', 'MF', 'FW'\] as const\)/g,
  "(['ALL', 'GK', 'ZAG', 'LE', 'LD', 'MEI', 'ATA'] as const)"
);

content = content.replace(
  /p\.position === marketPosFilter/g,
  "p.subPosition === marketPosFilter"
);

// Tactic fallback when mapping
content = content.replace(
  /const replacement = userClub\.squad\.find\(s => s\.position === p\.position/g,
  "const replacement = userClub.squad.find(s => s.subPosition === p.subPosition"
);

// Clubs sorted alphabetically
content = content.replace(
  /const cClubs = CLUB_DEFINITIONS\.filter\(c => c\.division === 'C'\);/g,
  "const cClubs = CLUB_DEFINITIONS.filter(c => c.division === 'C').sort((a, b) => a.name.localeCompare(b.name));"
);
content = content.replace(
  /const otherClubs = clubs\.filter\(c => c\.id !== userClubId\);/g,
  "const otherClubs = clubs.filter(c => c.id !== userClubId).sort((a, b) => a.name.localeCompare(b.name));"
);
content = content.replace(
  /clubs\.filter\(c => c\.division === selectedSearchDiv && c\.id !== userClubId\)/g,
  "clubs.filter(c => c.division === selectedSearchDiv && c.id !== userClubId).sort((a, b) => a.name.localeCompare(b.name))"
);


fs.writeFileSync('src/App.tsx', content);
console.log("Replaced");
