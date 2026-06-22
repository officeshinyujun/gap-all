"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const openai_1 = __importDefault(require("openai"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv = __importStar(require("dotenv"));

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const apiKeyString = process.env.OPENAI_API_KEYS || process.env.OPENAI_API_KEY || '';
const API_KEYS = apiKeyString.split(',').map(k => k.trim()).filter(k => k.length > 0);

if (API_KEYS.length === 0) {
  console.error('API keys are missing in .env');
  process.exit(1);
}
const clients = API_KEYS.map(key => new openai_1.default({ apiKey: key }));
let clientIndex = 0;
function getNextClient() {
    const client = clients[clientIndex % clients.length];
    clientIndex++;
    return client;
}
const PROMPT_PATH = path.resolve(__dirname, '..', '..', 'prompts', 'concept_highlight_v2.txt');
const DATA_DIR = path.resolve(__dirname, '..', '..', 'textbook', 'success_cards_moi');
const MODEL = 'gpt-4o';
const CONCURRENCY = 2;
const systemPrompt = fs.readFileSync(PROMPT_PATH, 'utf-8');
async function generateHighlight(task) {
    const { concept, realQ } = task;
    const client = getNextClient();
    const userContent = JSON.stringify({
        concept_name: concept.name,
        concept_definition: concept.card?.definition || '',
        question_stem: realQ.render_ready?.question_stem || realQ.stem || '',
        stimulus: realQ.render_ready?.stimulus_data
            ? JSON.stringify(realQ.render_ready.stimulus_data)
            : realQ.stimulus || '',
        options: realQ.render_ready?.options_list || realQ.options || [],
        correct_answer: parseCorrectAnswer(realQ.correct_answer ?? realQ.answer),
        combo_items: realQ.box_items || [],
    });
    try {
        const response = await client.chat.completions.create({
            model: MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent },
            ],
            temperature: 0.3,
        });
        const content = response.choices[0]?.message?.content ?? '';
        return extractJson(content);
    }
    catch (e) {
        console.error(`  ✗ [${concept.name}] API 오류: ${e.message}`);
        return null;
    }
}
function parseCorrectAnswer(value) {
    if (typeof value === 'number')
        return value;
    if (typeof value === 'string') {
        const map = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5 };
        if (map[value])
            return map[value];
        const num = parseInt(value.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(num) && num >= 1 && num <= 5)
            return num;
    }
    return 1;
}
function extractJson(text) {
    const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = codeBlock ? codeBlock[1].trim() : text.trim();
    return JSON.parse(raw);
}
async function processBatch(tasks) {
    const results = new Map();
    for (let i = 0; i < tasks.length; i += CONCURRENCY) {
        const batch = tasks.slice(i, i + CONCURRENCY);
        const promises = batch.map(async (task) => {
            const highlight = await generateHighlight(task);
            if (highlight) {
                console.log(`  ✓ ${task.concept.name} (단서 ${highlight.stimulusClues.length}개, 풀이 ${highlight.solvingFlow.length}단계)`);
                return { task, highlight };
            }
            return null;
        });
        const batchResults = await Promise.all(promises);
        for (const result of batchResults) {
            if (!result)
                continue;
            const { task, highlight } = result;
            if (!results.has(task.filePath))
                results.set(task.filePath, []);
            results.get(task.filePath).push({ idx: task.conceptIdx, highlight });
        }
        if (i + CONCURRENCY < tasks.length) {
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }
    return results;
}
async function main() {
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'));
    const allTasks = [];
    for (const file of files) {
        const filePath = path.join(DATA_DIR, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (!data.concepts)
            continue;
        for (let i = 0; i < data.concepts.length; i++) {
            const concept = data.concepts[i];
            const realQ = concept.realQuestion?.questionData;
            if (!realQ)
                continue;
            if (concept.realQuestion.conceptHighlightV2)
                continue;
            allTasks.push({ filePath, conceptIdx: i, concept, realQ });
        }
    }
    console.log(`총 ${allTasks.length}개 concept 처리 예정 (병렬 ${CONCURRENCY}, API키 ${API_KEYS.length}개)\n`);
    if (allTasks.length === 0) {
        console.log('처리할 항목 없음. 이미 모두 완료됨.');
        return;
    }
    const results = await processBatch(allTasks);
    let savedCount = 0;
    for (const [filePath, highlights] of results) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        for (const { idx, highlight } of highlights) {
            data.concepts[idx].realQuestion.conceptHighlightV2 = highlight;
            savedCount++;
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`💾 ${path.basename(filePath)} 저장 (${highlights.length}개 업데이트)`);
    }
    console.log(`\n========================================`);
    console.log(`완료: ${savedCount}/${allTasks.length} 성공, ${allTasks.length - savedCount}개 실패`);
}
main().catch(console.error);
//# sourceMappingURL=regenerate-concept-highlights.js.map