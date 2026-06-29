import{d as m}from"./index-CqqgP6nD.js";import{O as S,g as h,i as $}from"./index-DLklaSBE.js";const y=S("session",()=>{const l=h(null),a=h(null),o=h(!1),s=h(0);let i=null;function c(){o.value=!0,s.value=0,i=setInterval(()=>{s.value++},1e3)}function r(){o.value=!1,i&&(clearInterval(i),i=null)}return{currentArchiveId:l,selectedApiId:a,isGenerating:o,generatingSeconds:s,startGenerating:c,stopGenerating:r}});async function k(l){const a=await m.archives.get(l);if(!a)return"";const o=[];a.promptStory&&o.push(a.promptStory);const s=await m.systemConfigs.bulkGet(a.referencedSystemConfigKeys);for(const t of s)t&&o.push(`【${t.key}】
${t.value}`);for(const t of a.privateConfigs)o.push(`【${t.key}】
${t.value}`);a.worldSetting&&o.push(`【初始世界观】
${a.worldSetting}`);for(const t of a.worldConfigs)o.push(`【${t.key}】
${t.value}`);const i=[],c=await m.characterRoles.bulkGet(a.referencedSystemRoleIds);for(const t of c)t&&i.push(t);const r=await m.characterRoles.where({archiveId:l}).toArray();r.sort((t,e)=>e.sortOrder-t.sortOrder);for(const t of r)i.some(e=>e.id===t.id)||i.push(t);if(i.length>0){const t=[];for(const e of i){const u=[];u.push(`【角色名称】${e.name}`),e.age&&u.push(`年龄：${e.age}`),e.gender&&u.push(`性别：${e.gender}`),e.identity&&u.push(`身份定位：${e.identity}`),e.background&&u.push(`背景故事：${e.background}`),e.appearance&&u.push(`形象与气质：${e.appearance}`),e.personalityPreferences&&u.push(`性格与喜好：${e.personalityPreferences}`),e.keyLines&&u.push(`关键台词意象：${e.keyLines}`),e.abilities&&u.push(`能力：${e.abilities}`),t.push(u.join(`
`))}o.push(`【角色设定】
${t.join(`

`)}`)}const n=a.memory;return(n.currentStatus||n.plotLine||n.characterRelations||n.pendingIssues||n.keyInfo)&&o.push(`【当前剧情记忆】
[当前状态]${n.currentStatus}
[完整剧情进展]${n.plotLine}
[完整角色关系]${n.characterRelations}
[待解决问题]${n.pendingIssues}
[关键信息]${n.keyInfo}`),o.join(`

`)}async function I(l){return(await m.messages.where({archiveId:l,summaryStatus:"未操作"}).sortBy("timestamp")).map(o=>({role:o.role,content:o.content}))}async function w(l,a,o,s){var u,p,d,f;const i=y(),c=s??i.selectedApiId??void 0,r=c!==void 0?await m.apiConfigs.get(c):void 0;if(!r)throw new Error("未选择 API 配置");const n=[{role:"system",content:a},...o],t=await fetch(`${r.baseUrl}/v1/chat/completions`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${r.apiKey}`},body:JSON.stringify({model:r.model,temperature:r.temperature,messages:n})});if(!t.ok)throw new Error(`API 请求失败: ${t.status}`);const e=await t.json();return{content:e.choices[0].message.content,usage:{promptTokens:((u=e.usage)==null?void 0:u.prompt_tokens)??0,cachedTokens:((d=(p=e.usage)==null?void 0:p.prompt_tokens_details)==null?void 0:d.cached_tokens)??0,completionTokens:((f=e.usage)==null?void 0:f.completion_tokens)??0}}}function T(){async function l(s,i){const c=y(),r=$();c.startGenerating();try{const n=await k(s),t=await I(s);i&&t.push({role:"user",content:i});const e=await w(s,n,t),u=await m.messages.add({archiveId:s,role:"assistant",content:e.content,timestamp:Date.now(),summaryStatus:"未操作"}),p=await m.archives.get(s);return p&&await m.archives.update(s,{tokenStats:{missCost:p.tokenStats.missCost+(e.usage.promptTokens-e.usage.cachedTokens),hitCost:p.tokenStats.hitCost+e.usage.cachedTokens,outputCost:p.tokenStats.outputCost+e.usage.completionTokens}}),u}catch(n){const t=n instanceof Error?n.message:"AI 请求失败，请重试";throw r.showToast(t,"error"),n}finally{c.stopGenerating()}}async function a(s,i,c){const r=await m.archives.get(s),n=(r==null?void 0:r.promptSummary)||"请对以下内容进行总结。",t=i.map(f=>`[${f.role==="user"?"用户":"AI"}]: ${f.content}`).join(`

`),u=`【现有记忆】
${`
[当前状态]${c.currentStatus}
[完整剧情进展]${c.plotLine}
[完整角色关系]${c.characterRelations}
[待解决问题]${c.pendingIssues}
[关键信息]${c.keyInfo}`}

【新对话内容】
${t}`,p=y(),d=$();p.startGenerating();try{const f=(r==null?void 0:r.memoryApiId)??p.selectedApiId??void 0,g=await w(s,n,[{role:"user",content:u}],f);return p.stopGenerating(),v(g.content)}catch(f){p.stopGenerating();const g=f instanceof Error?f.message:"总结请求失败";throw d.showToast(g,"error"),f}}async function o(s,i){const c=await fetch(`${s}/v1/models`,{headers:{Authorization:`Bearer ${i}`}});if(!c.ok)throw new Error("获取模型列表失败");return((await c.json()).data||[]).map(n=>n.id)}return{executeAiInference:l,callSummaryLLM:a,fetchModels:o}}function v(l){const a=l.split(/\n(?=\[当前状态\]|\[完整剧情进展\]|\[完整角色关系\]|\[待解决问题\]|\[关键信息\])/),o={currentStatus:"",plotLine:"",characterRelations:"",pendingIssues:"",keyInfo:""};for(const s of a)s.startsWith("[当前状态]")?o.currentStatus=s.replace("[当前状态]","").trim():s.startsWith("[完整剧情进展]")?o.plotLine=s.replace("[完整剧情进展]","").trim():s.startsWith("[完整角色关系]")?o.characterRelations=s.replace("[完整角色关系]","").trim():s.startsWith("[待解决问题]")?o.pendingIssues=s.replace("[待解决问题]","").trim():s.startsWith("[关键信息]")&&(o.keyInfo=s.replace("[关键信息]","").trim());return o}export{y as a,w as c,T as u};
