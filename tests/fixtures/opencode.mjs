import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
if (process.argv.includes('--version')) {
  console.log(process.env.FIXTURE_MODE === 'v3' ? 'opencode v3.0.0' : '1.18.29');
  process.exit(0);
}
if (process.env.FIXTURE_MODE === 'v3') throw new Error('unknown server must not be started');
let events, message;
const emit = (type, properties) =>
  events.write(`data: ${JSON.stringify({ type, properties })}\n\n`);
const json = (response, value) => {
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(value));
};
const server = createServer(async (request, response) => {
  const auth = `Basic ${Buffer.from(`opencode:${process.env.OPENCODE_SERVER_PASSWORD}`).toString('base64')}`;
  if (request.headers.authorization !== auth) {
    response.writeHead(401);
    response.end();
    return;
  }
  let raw = '';
  for await (const chunk of request) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  if (request.url === '/session') {
    if (body.permission.at(-1).action !== 'deny' || body.permission[0].action !== 'ask') {
      response.writeHead(400);
      response.end();
      return;
    }
    if (
      process.env.FIXTURE_MODE === 'reduced' &&
      !body.permission.some(
        (rule) =>
          rule.permission === 'edit' &&
          rule.action === 'allow' &&
          rule.pattern === `${process.cwd()}/**`,
      )
    ) {
      response.writeHead(400);
      response.end();
      return;
    }
    json(response, { id: 'ses_fixture' });
  } else if (request.url === '/event') {
    events = response;
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write('data: {"type":"server.connected","properties":{}}\n\n');
  } else if (request.url === '/session/ses_fixture/message') {
    message = response;
    if (process.env.FIXTURE_MODE === 'reduced') {
      writeFileSync(join(process.cwd(), 'button.css'), 'button { height: 40px; }');
      json(response, { info: {}, parts: [{ type: 'text', text: '已修改 button.css 并验证' }] });
      return;
    }
    if (process.env.FIXTURE_MODE === 'error') {
      json(response, { info: { error: { message: 'fake-key-must-not-leak' } } });
      return;
    }
    if (process.env.FIXTURE_MODE === 'exit') {
      process.exit(1);
    }
    if (!body.parts[0].text.includes('untrustedPageContext')) {
      response.writeHead(400);
      response.end();
      return;
    }
    if (process.env.FIXTURE_MODE === 'question') {
      emit('question.asked', {
        sessionID: 'ses_fixture',
        id: 'que_fixture',
        questions: [{ question: '确认尺寸', options: [{ label: '40px' }] }],
      });
    } else
      emit('permission.asked', {
        sessionID: 'ses_fixture',
        id: 'per_fixture',
        permission: 'edit',
        patterns: ['button.css'],
        metadata: {},
      });
  } else if (
    request.url === '/permission/per_fixture/reply' ||
    request.url === '/question/que_fixture/reply'
  ) {
    if (body.reply === 'always') {
      response.writeHead(400);
      response.end();
      return;
    }
    json(response, true);
    if (body.reply === 'once' || body.answers?.[0]?.[0] === '40px') {
      writeFileSync(join(process.cwd(), 'button.css'), 'button { height: 40px; }');
      json(message, { info: {}, parts: [{ type: 'text', text: '已修改 button.css 并验证' }] });
    } else json(message, { info: {}, parts: [{ type: 'text', text: '用户拒绝，未修改文件' }] });
  } else {
    response.writeHead(404);
    response.end();
  }
});
server.listen(0, '127.0.0.1', () =>
  console.log(`opencode server listening on http://127.0.0.1:${server.address().port}`),
);
