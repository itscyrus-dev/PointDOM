import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CliRunner } from '../../src/bridge/cli-runner.js';
import { cliIds, type CliId } from '../../src/shared/cli.js';
/** An actual child process, isolated from installed agents, credentials and paid models. */
export function fixtureCli(
  directory: string,
  options: { available?: CliId[]; holdAfterFirst?: boolean } = {},
) {
  const entry = join(directory, 'cli-fixture.cjs');
  writeFileSync(
    entry,
    `const fs=require('node:fs');let input='';process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{
    const task=JSON.parse(input);
    const marker=${JSON.stringify(join(directory, 'cli-first-completed'))};
    if (${!!options.holdAfterFirst} && fs.existsSync(marker)) { setInterval(()=>{},100); return; }
    fs.writeFileSync(marker,'1');
    if(fs.existsSync('button.css'))fs.writeFileSync('button.css','button { height: 40px; }');
    console.log(JSON.stringify({type:'item.started',item:{id:'command-1',type:'command_execution',command:'node --version'}}));
    setTimeout(()=>{const text='已将发送按钮高度改为 40px';
      console.log(JSON.stringify({type:'item.completed',item:{id:'command-1',type:'command_execution',command:'node --version',status:'completed',exit_code:0,aggregated_output:require('node:child_process').execFileSync(process.execPath,['--version'],{encoding:'utf8'})}}));
      console.log(JSON.stringify({type:'item.completed',item:{id:'file-1',type:'file_change',status:'completed',changes:[{path:'button.css',kind:'update'}]}}));
      console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text}}));
      console.log(JSON.stringify({type:'turn.completed'}));
      console.log(JSON.stringify({type:'text',part:{text}}));
      console.log(JSON.stringify({type:'step_finish',part:{reason:'stop'}}));
      console.log(JSON.stringify({type:'result',subtype:'success',result:text}));
    },200);
  });`,
  );
  return new CliRunner({
    resolve: async (id) =>
      (options.available || cliIds).includes(id)
        ? { command: process.execPath, prefix: [entry], dialect: 'exec' }
        : null,
    timeoutMs: 10000,
  });
}
