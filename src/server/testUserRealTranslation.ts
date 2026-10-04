import { Store } from './store.js';
import { translateTextWithGemini } from './geminiTranslator.js';

async function testRealGeminiTranslation() {
  const keys = Store.getKeys();
  console.log(`Found ${keys.length} active keys:`, keys.map((k) => k.slice(0, 10) + '...'));

  const sampleChinese = `第1章 试剑天下\n少年仗剑走天涯，一剑光寒十九州。风云变幻，英雄辈出。`;
  console.log('\nTesting real Gemini translation on sample text...\nSource:', sampleChinese);

  const result = await translateTextWithGemini(sampleChinese, keys[0]);
  console.log('\n--- REAL GEMINI TRANSLATION OUTPUT ---');
  console.log(result.text);
  console.log('-------------------------------------\n');
}

testRealGeminiTranslation().catch(console.error);
