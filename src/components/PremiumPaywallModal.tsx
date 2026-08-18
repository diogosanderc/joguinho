import React, { useState } from 'react';
import { usePremium } from '../context/PremiumContext';

const PREMIUM_PRICE_LABEL = 'R$ 9,99';

const PREMIUM_PERKS = [
  'Remove os anúncios completamente',
  'Começar carreira também pela Série A e Série B',
  'Negociar jogadores de clubes da Série A',
  'Departamento Médico e Categoria de Base',
  '4 slots de campanhas salvas (em vez de 1)',
  'Disputar Copa, Libertadores e Seleção Brasileira',
  'Velocidade média de partida',
];

interface PremiumPaywallModalProps {
  reason: string;
  onClose: () => void;
}

export const PremiumPaywallModal: React.FC<PremiumPaywallModalProps> = ({ reason, onClose }) => {
  const { purchase, restore } = usePremium();
  const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePurchase = async () => {
    setBusy('purchase');
    setError(null);
    const purchased = await purchase();
    setBusy(null);
    if (purchased) onClose();
    else setError('Não foi possível completar a compra agora. Tente novamente.');
  };

  const handleRestore = async () => {
    setBusy('restore');
    setError(null);
    const restored = await restore();
    setBusy(null);
    if (restored) onClose();
    else setError('Nenhuma compra encontrada pra restaurar.');
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1400 }}>
      <div className="modal-content" style={{ width: '100%', maxWidth: '340px', padding: '18px', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <span style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
            🔒 {reason}
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '1.4rem', cursor: 'pointer', fontWeight: 800 }}
          >
            ×
          </button>
        </div>

        <h3 style={{ fontWeight: 800, fontSize: '1.2rem', margin: '6px 0 12px', color: 'var(--accent-gold)' }}>
          Retrofoot Premium
        </h3>

        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {PREMIUM_PERKS.map(perk => (
            <li key={perk} style={{ fontSize: '0.78rem', color: '#d1d5db', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--accent-green)' }}>✓</span>
              <span>{perk}</span>
            </li>
          ))}
        </ul>

        {error && (
          <p style={{ fontSize: '0.72rem', color: 'var(--accent-red)', marginBottom: '10px' }}>{error}</p>
        )}

        <button
          onClick={handlePurchase}
          disabled={busy !== null}
          className="btn btn-primary"
          style={{ width: '100%', padding: '12px 0', fontWeight: 800, marginBottom: '10px', opacity: busy !== null ? 0.7 : 1 }}
        >
          {busy === 'purchase' ? 'Processando...' : `Desbloquear Premium (${PREMIUM_PRICE_LABEL})`}
        </button>

        <button
          onClick={handleRestore}
          disabled={busy !== null}
          style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline' }}
        >
          {busy === 'restore' ? 'Restaurando...' : 'Restaurar compra'}
        </button>
      </div>
    </div>
  );
};
