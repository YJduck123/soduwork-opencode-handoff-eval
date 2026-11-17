const token = process.env.SODUWORK_OPENCODE_OUTCOME;
delete process.env.SODUWORK_OPENCODE_OUTCOME;
export default async () => {
  const turns = new Map();
  // OpenCode 1.18.18 MessageID.ascending encodes time + a process counter in
  // the first twelve hex digits. The random suffix is never an ordering key.
  const order = id => typeof id === 'string' && /^msg_[0-9a-f]{12}[A-Za-z0-9]{14}$/.test(id)
    ? id.slice(4, 16) : '';
  const send = value => process.stderr.write('SODUWORK_OPENCODE_OUTCOME:' +
    JSON.stringify({ token, ...value }) + '\n');
  send({ kind: 'ready' });
  return {
    'chat.message': async (input, output) => {
      const sid = input.sessionID, user = output.message?.id;
      if (!sid || !order(user)) throw new Error('OpenCode turn identity is unavailable');
      const invocation = (turns.get(sid)?.invocation || 0) + 1;
      turns.set(sid, { invocation, user, floor: order(user), users: new Set([user]), latest: '', message: '', reason: '' });
      send({ kind: 'begin', sid, user, invocation });
    },
    event: async ({ event }) => {
      const props = event.properties || {};
      if (event.type === 'message.updated') {
        const info = props.info || {}, turn = turns.get(info.sessionID);
        if (!turn || !order(info.id) || order(info.id) <= turn.floor) return;
        // Auto-compaction creates native replay/continue users without calling
        // chat.message. Only fresh users observed in this owned session qualify.
        if (info.role === 'user') { turn.users.add(info.id); return; }
        if (info.role !== 'assistant' || info.summary || !turn.users.has(info.parentID) ||
            order(info.parentID) >= order(info.id) || order(info.id) < turn.latest) return;
        if (order(info.id) === turn.latest && info.id !== turn.message) { turn.invalid = true; return; }
        if (info.id !== turn.message) { turn.message = info.id; turn.latest = order(info.id); turn.reason = ''; }
        if (typeof info.finish === 'string') turn.reason = info.finish;
      }
      if (event.type === 'session.status' && props.status?.type === 'idle') {
        const turn = turns.get(props.sessionID);
        if (turn) send({ kind: 'end', sid: props.sessionID, user: turn.user, invocation: turn.invocation, reason: turn.invalid ? '' : turn.reason });
      }
    },
  };
};
