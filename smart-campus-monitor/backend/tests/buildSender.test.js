const { buildSender } = require('../services/notification');

describe('buildSender', () => {
  const env = { SMTP_USER: 'login@gmail.com', EMAIL_FROM: 'Campus <noreply@college.edu>' };

  it('sends from the SMTP login and keeps the configured address as reply-to', () => {
    expect(buildSender('Campus', env)).toEqual({
      from: { name: 'Campus', address: 'login@gmail.com' },
      replyTo: 'noreply@college.edu',
    });
  });

  it('leaves the sender alone when it already matches the login', () => {
    expect(buildSender('', { SMTP_USER: 'a@x.com', EMAIL_FROM: '"Name" <a@x.com>' })).toEqual({
      from: { name: 'Name', address: 'a@x.com' },
    });
  });
});
