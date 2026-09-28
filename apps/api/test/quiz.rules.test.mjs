import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {parseDocument,normalizeAnswer,answerText,validateWindows,isOpen,fitsWindow,nextWindow,dayKey,hintPositions,mask}=require('../dist/quiz/quiz.rules.js');
const doc={version:1,id:'nature',theme:'Природа',questions:[{id:'tree',question:'Какое дерево украшают зимой?',answer:'ёлочка',acceptedAnswers:['новогодняя ёлка']}]};
test('JSON is bounded, rejects ambiguous aliases and duplicate IDs',()=>{
 assert.equal(parseDocument(doc).questions[0].answer,'ёлочка');
 for(const bad of [null,[],{...doc,version:2},{...doc,questions:[]},{...doc,questions:[...doc.questions,...doc.questions]},{...doc,questions:[{...doc.questions[0],answer:'да'}]},{...doc,questions:[{...doc.questions[0],acceptedAnswers:['ЕЛОЧКА!']}]},{...doc,questions:[{...doc.questions[0],question:'x'.repeat(501)}]}])assert.throws(()=>parseDocument(bad));
});
test('Exact answers normalize Unicode, spaces, outer punctuation and bot addressing',()=>{
 assert.equal(normalizeAnswer(' «НоВоГоДнЯя   ЁлКа!» '),'новогодняя елка');
 assert.equal(answerText('@tusova_quiz: ЁЛОЧКА!'),'елочка');
 assert.notEqual(answerText('Наверное, елочка'),'елочка');
 assert.equal(normalizeAnswer('ＡＢＣ'),'abc');
});
test('Two distinct letter hints never expose a complete short answer',()=>{
 for(let i=0;i<100;i++){const pos=hintPositions('Ёжик-3');assert.equal(new Set(pos).size,2);assert.equal(mask('Ёжик-3',pos,0),'▢▢▢▢-▢');assert.equal(mask('Ёжик-3',pos,2).replace(/[^▢]/g,'').length,3);}
 assert.equal(mask('сова',[0,1],2),'со▢▢');
});
test('Time zones, overnight days and closing boundary are respected',()=>{
 const night=validateWindows([{days:[1],start:'22:00',end:'02:00'}],'Asia/Barnaul');
 assert(isOpen(new Date('2026-09-28T16:00:00Z'),'Asia/Barnaul',night));
 assert(isOpen(new Date('2026-09-28T18:59:00Z'),'Asia/Barnaul',night));
 assert(!isOpen(new Date('2026-09-28T19:00:00Z'),'Asia/Barnaul',night));
 assert(!fitsWindow(new Date('2026-09-28T18:59:30Z'),90,'Asia/Barnaul',night));
 assert.equal(nextWindow(new Date('2026-09-28T19:00:00Z'),90,'Asia/Barnaul',night).toISOString(),'2026-10-05T15:00:00.000Z');
 assert.equal(dayKey(new Date('2026-09-28T18:00:00Z'),'Asia/Barnaul'),'Asia/Barnaul:2026-09-29');
 assert.throws(()=>validateWindows([{days:[1],start:'22:00',end:'22:00'}],'UTC'));
 assert.throws(()=>validateWindows(night,'Not/AZone'));
});
