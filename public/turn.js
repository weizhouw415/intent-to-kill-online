export function turnOwner(state) {
  if (!state || state.phase === 'waiting' || state.phase === 'finished') return null;
  if (state.pending) return 'killer';
  if (['setup_support','killer_intimidate','killer_murder','city_killer'].includes(state.phase)) return 'killer';
  if (['setup_detective','evacuate','detective','city_detective','round_end'].includes(state.phase)) return 'detective';
  return null;
}

export function nextHandoff(session, nextState) {
  if (session?.mode !== 'local') return null;
  const owner = turnOwner(nextState);
  return owner && owner !== session.activeRole ? owner : null;
}
