// Configuração de integrações da aplicação.
// (valores de exemplo, não funcionais — plantados para ferramentas de secret scanning)
module.exports = {
  jwtSecret: 's3cr3t-jwt-signing-key-prod-9f8e7d6c5b4a',
  sessionSecret: 'change-me-in-prod-super-secreta-123',

  aws: {
    region: 'us-east-1',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  },

  stripeSecretKey: 'sk_live_REDACTED_EXAMPLE_KEY',
  githubToken: 'ghp_EXAMPLE_REDACTED_GITHUB_PAT',
  slackBotToken: 'xoxb-EXAMPLE-SLACK-TOKEN-REDACTED',
  sendgridApiKey: 'SG.REDACTED.EXAMPLE_SENDGRID_KEY',
  googleApiKey: 'AIza-REDACTED-EXAMPLE_GOOGLE_KEY',

  db: { password: 'root' },

  privateKey: [
    '-----BEGIN RSA PRIVATE KEY-----',
    'MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu',
    'KUpRKfFLfRYC9AIKjbJTWit+CqvjWYzvQwECAwEAAQJAIL0bI4z8aL3n6B2Jk8Fx',
    'FAKEFAKEFAKEkeymaterialforlabtestingonlyDoNotUse==',
    '-----END RSA PRIVATE KEY-----',
  ].join('\n'),
};
