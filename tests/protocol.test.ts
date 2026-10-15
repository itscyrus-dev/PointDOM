import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCodex } from '../src/bridge/codex.js';
import type { Approval, Job } from '../src/shared/contracts.js';
for (const reduced of [false, true])
  test(`real JSONL transport preserves sandbox and explicit approvals with project permissions ${reduced}`, async () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), 'pagepatch-rpc-')));
    const file = join(directory, 'codex-fixture');
    const previous = process.env.PAGEPATCH_CODEX_BIN;
    writeFileSync(
      file,
      `#!/usr/bin/env node
const readline=require('node:readline'); const send=m=>process.stdout.write(JSON.stringify(m)+'\\n');
const reduced=${reduced};
readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);
if(m.method==='initialize') send({id:m.id,result:{}});
if(m.method==='model/list') send({id:m.id,result:{data:[{model:'test-model',isDefault:true,supportedReasoningEfforts:[{reasoningEffort:'high'}],serviceTiers:[{id:'fast',name:'快速'}]}]}});
if(m.method==='thread/start' && (['model','effort','serviceTier'].some(k=>k in m.params) || (reduced ? m.params.approvalPolicy!=='on-request' : 'approvalPolicy' in m.params)))process.exit(6);
if(m.method==='thread/start') send({id:m.id,result:{thread:{id:'thread-1'}}});
if(m.method==='turn/start'){ if(['model','effort','serviceTier'].some(k=>k in m.params) || (reduced ? m.params.approvalPolicy!=='on-request' : 'approvalPolicy' in m.params))process.exit(5); if(m.params.sandboxPolicy.type!=='workspaceWrite' || m.params.sandboxPolicy.networkAccess!==reduced || m.params.sandboxPolicy.writableRoots.length!==1 || m.params.sandboxPolicy.writableRoots[0]!==process.cwd())process.exit(2); send({id:m.id,result:{turn:{id:'turn-1'}}}); send({id:'permission-1',method:'item/commandExecution/requestApproval',params:{threadId:'thread-1',command:'pnpm test'}}); send({id:'permission-2',method:'item/fileChange/requestApproval',params:{threadId:'thread-1',reason:'Apply CSS patch'}}); }
if(m.id==='permission-1' && m.result.decision!=='accept')process.exit(3);
if(m.id==='permission-2'){if(m.result.decision!=='accept')process.exit(4);send({method:'item/completed',params:{threadId:'thread-1',item:{type:'agentMessage',text:'检查通过'}}});send({method:'turn/completed',params:{threadId:'thread-1',turn:{status:'completed'}}});}
});`,
      { mode: 0o700 },
    );
    process.env.PAGEPATCH_CODEX_BIN = file;
    const job = {
      permissions: reduced ? { confirmation: 'reduced', codexNetwork: true } : undefined,
      instruction: '调整按钮',
      selection: { label: '发送' },
      execution: {
        model: 'test-model',
        effort: 'high',
        serviceTier: 'fast',
        approvalPolicy: 'untrusted',
      },
    } as Job;
    const approvals: Approval[] = [];
    let result = '';
    const run = runCodex({ id: 'p', name: 'p', cwd: directory, origins: [] }, job, undefined, {
      event() {},
      result: (value) => {
        result = value;
      },
      thread: (id) => assert.equal(id, 'thread-1'),
      approval: (value) => {
        approvals.push(value);
        queueMicrotask(() => run.reply(value.id, { decision: 'accept' }));
      },
      approved() {},
    });
    try {
      await run.done;
      assert.deepEqual(
        approvals.map((value) => value.kind),
        ['command', 'files'],
      );
      assert.equal(result, '检查通过');
    } finally {
      if (previous) process.env.PAGEPATCH_CODEX_BIN = previous;
      else delete process.env.PAGEPATCH_CODEX_BIN;
      rmSync(directory, { recursive: true, force: true });
    }
  });
