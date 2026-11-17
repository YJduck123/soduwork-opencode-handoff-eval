const permission = {"*": "allow", "question": "deny", "doom_loop": "deny"};
const agentId = "soduwork-access-cb28277555194fb8b84f8a95eac39ebd";
const profile = "build";
export default async () => {
  let finalConfig;
  const matches = value => JSON.stringify(value) === JSON.stringify(permission);
  return {
  config: async config => {
    config.permission = structuredClone(permission);
    config.agent ||= {};
    for (const agent of Object.values(config.agent)) {
      if (agent && typeof agent === 'object') agent.permission = structuredClone(permission);
    }
    config.agent[agentId] = { mode: 'primary', description: 'SoduWork session access policy',
      permission: structuredClone(permission) };
    config.agent[profile] = { ...config.agent[profile], disable: false, hidden: false,
      mode: 'primary', permission: structuredClone(permission) };
    config.default_agent = profile;
    finalConfig = config;
  },
  'tool.execute.before': async () => {
    if (!finalConfig || !matches(finalConfig.permission) ||
        Object.values(finalConfig.agent).some(agent => !matches(agent.permission))) {
      throw new Error('SoduWork access policy was changed after initialization. Operation blocked.');
    }
  },
  };
};
