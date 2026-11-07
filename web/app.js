const backend = { url: '', kind: 'rest', endpoint: 'ask' };

const prompts = [
  {
    question: 'كيف بقدّم طلب سحب متأخر لمساق؟',
    icon: 'file',
    keywords: 'انسحاب سحب مادة حذف مساق تقديم طلب',
    sample: {
      answer: 'بتقدّم الطلب من البوابة الأكاديمية. حسب دليل الجامعة، طلب السحب المتأخر للمساق بيمرّ بالترتيب على الطالب، ثم المرشد الأكاديمي، ثم عميد الكلية.',
      sources: [{
        document: 'دليل السياسات والإجراءات',
        page: 17,
        url: 'https://paluniv.edu.ps/wp-content/uploads/2023/12/دليل-السياسات-والإجراءات-لجامعة-فلسطين-الأهلية-كانون-أول-2023.pdf#page=17',
      }],
    },
  },
  {
    question: 'كم ساعة معتمدة لبكالوريوس الذكاء الاصطناعي؟',
    icon: 'book',
    keywords: 'ذكاء اصطناعي تخصص عدد ساعات الخطة الدراسية',
    sample: {
      answer: 'الخطة المنشورة لبكالوريوس الذكاء الاصطناعي بتتطلّب **133 ساعة معتمدة**. منها 27 ساعة لمتطلبات الجامعة، و25 للكلية، و78 للتخصص، و3 ساعات حرة.',
      sources: [{
        document: 'بكالوريوس الذكاء الاصطناعي',
        section: 'الساعات المعتمدة',
        url: 'https://www.paluniv.edu.ps/?page_id=145638',
      }],
    },
  },
  {
    question: 'كيف بتواصل مع دائرة القبول والتسجيل؟',
    icon: 'mail',
    keywords: 'رقم هاتف بريد ايميل عمادة التسجيل تواصل اتصال',
    sample: {
      answer: 'تقدر تتواصل مع دائرة القبول والتسجيل بالبريد الإلكتروني reg@paluniv.edu.ps، أو على الرقم 02-2751566، فرعي 142.',
      sources: [{
        document: 'أريد التسجيل في الجامعة',
        section: 'معلومات الاتصال',
        url: 'https://www.paluniv.edu.ps/?page_id=136970',
      }],
    },
  },
  { question: 'كيف بقدّم طلب تأجيل فصل دراسي؟', keywords: 'تأجيل الدراسة الفصل تأجيل دوام' },
  { question: 'شو شروط التخرّج من البكالوريوس؟', keywords: 'تخرج معدل متطلبات البكالوريوس شهادة' },
  { question: 'كيف بعادل مساقات درستها بجامعة ثانية؟', keywords: 'تحويل انتقال معادلة مواد جامعة أخرى' },
  { question: 'كيف أعرف المتطلب السابق للمساق؟', keywords: 'متطلبات مادة متطلب سابق مساق الخطة' },
  { question: 'شو المنح والمساعدات المتاحة للطلبة؟', keywords: 'منحة منح مساعدة مالية إعفاء الرسوم' },
  { question: 'وين بلاقي الخطة الدراسية لتخصصي؟', keywords: 'خطط دراسية جدول مواد برامج البكالوريوس' },
  { question: 'شو أعمل إذا غبت عن الامتحان النهائي؟', keywords: 'غياب امتحانات امتحان مريض مرض غير مكتمل' },
  { question: 'كيف بقدّم طلب التحاق بالجامعة؟', keywords: 'تسجيل قبول طلبة جدد توجيهي طلب التحاق' },
  { question: 'كم ساعة بقدر أسجّل بالفصل؟', keywords: 'ساعات حد أعلى أقصى عبء دراسي تسجيل' },
];

const workspace = document.querySelector('#main');
const intro = document.querySelector('.intro-slot');
const form = document.querySelector('#ask-form');
const input = document.querySelector('#question');
const askButton = document.querySelector('#ask-button');
const starters = document.querySelector('#question-suggestions');
const starterList = document.querySelector('#starter-list');
const activeHeading = document.querySelector('#active-heading');
const newQuestion = document.querySelector('#new-question');
const completion = document.querySelector('#completion');
const autocomplete = document.querySelector('#autocomplete');
const interactionStatus = document.querySelector('#interaction-status');
const result = document.querySelector('#result');
const resultTitle = document.querySelector('#result-title');
const answerMode = document.querySelector('#answer-mode');
const loading = document.querySelector('#loading');
const answerText = document.querySelector('#answer');
const sourceSection = document.querySelector('#source-section');
const sourcesList = document.querySelector('#sources');
const settings = document.querySelector('#settings');
const motion = document.querySelector('#motion');
const root = document.documentElement;

function makeIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  use.setAttribute('href', '#icon-' + name);
  svg.append(use);
  return svg;
}

function normalized(text) {
  return text.normalize('NFKC').toLowerCase()
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىي]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim().replace(/\s+/g, ' ');
}

function findCompletions(value) {
  const query = normalized(value);
  if (query.length < 2) return [];
  const words = query.split(' ');
  const meaningful = words.filter((word) => !['كيف', 'شو', 'وين', 'كم', 'مين', 'هل', 'عن', 'من', 'مع'].includes(word));
  return prompts.map((entry, index) => {
    const question = normalized(entry.question);
    const searchable = normalized(entry.question + ' ' + entry.keywords);
    const matches = meaningful.length && meaningful.every((word) => {
      const term = word.replace(/^ال(?=\p{Script=Arabic}{3})/u, '');
      return searchable.split(' ').some((candidate) => candidate.includes(term));
    });
    let score = 0;
    if (question.startsWith(query) && question !== query) score = 5;
    else if (query.length >= 3 && question.includes(query) && question !== query) score = 4;
    else if (matches && question !== query) score = 2;
    return { entry, score, index };
  }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3).map(({ entry }) => entry.question);
}

let suggestions = [];
let highlighted = -1;
let asking = false;

function hideCompletion() {
  suggestions = [];
  highlighted = -1;
  autocomplete.replaceChildren();
  completion.hidden = true;
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('aria-activedescendant');
}

function useSuggestion(value) {
  input.value = value;
  input.setCustomValidity('');
  hideCompletion();
  input.focus();
}

function selectSuggestion(index) {
  highlighted = index;
  for (const [i, item] of Array.from(autocomplete.children).entries()) {
    item.setAttribute('aria-selected', String(i === index));
  }
  input.setAttribute('aria-activedescendant', 'completion-' + index);
}

function showCompletions() {
  hideCompletion();
  suggestions = findCompletions(input.value);
  if (!suggestions.length) return;
  for (const [i, value] of suggestions.entries()) {
    const item = document.createElement('li');
    item.id = 'completion-' + i;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', 'false');
    item.append(value, makeIcon('arrow'));
    item.addEventListener('pointerdown', (event) => event.preventDefault());
    item.addEventListener('click', () => useSuggestion(value));
    autocomplete.append(item);
  }
  completion.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  interactionStatus.textContent = 'اقتراحات متاحة لإكمال السؤال.';
}

for (const entry of prompts.slice(0, 3)) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'starter-question';
  const icon = document.createElement('span');
  icon.className = 'starter-icon';
  icon.append(makeIcon(entry.icon));
  const text = document.createElement('span');
  text.textContent = entry.question;
  button.append(icon, text);
  button.addEventListener('click', () => useSuggestion(entry.question));
  starterList.append(button);
}

input.addEventListener('input', (event) => {
  input.setCustomValidity('');
  if (!event.isComposing) showCompletions();
});
input.addEventListener('compositionend', showCompletions);
input.addEventListener('blur', hideCompletion);
input.addEventListener('keydown', (event) => {
  if (event.isComposing || !suggestions.length) return;
  if (event.key === 'Escape') hideCompletion();
  if (event.key === 'Tab' && !event.shiftKey) {
    event.preventDefault();
    useSuggestion(suggestions[Math.max(0, highlighted)]);
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const last = suggestions.length - 1;
    const index = event.key === 'ArrowDown'
      ? (highlighted + 1) % suggestions.length
      : (highlighted <= 0 ? last : highlighted - 1);
    selectSuggestion(index);
  }
});

function setActive(active) {
  workspace.classList.toggle('is-active', active);
  intro.inert = active;
  starters.hidden = active;
  activeHeading.hidden = !active;
}

newQuestion.addEventListener('click', () => {
  if (asking) return;
  setActive(false);
  result.hidden = true;
  input.value = '';
  input.setCustomValidity('');
  interactionStatus.textContent = '';
  hideCompletion();
  input.focus();
});

function applyAppearance() {
  root.dataset.theme = settings.querySelector('input[name="theme"]:checked').value;
  root.dataset.motion = motion.checked ? 'on' : 'off';
  try {
    localStorage.setItem('murshid-appearance', JSON.stringify({ theme: root.dataset.theme, motion: motion.checked }));
  } catch {
    // The active page still respects the current selection.
  }
}

document.querySelector('#open-settings').addEventListener('click', () => {
  settings.querySelector(`input[name="theme"][value="${root.dataset.theme}"]`).checked = true;
  motion.checked = root.dataset.motion !== 'off';
  settings.showModal();
});
document.querySelector('#close-settings').addEventListener('click', () => settings.close());
settings.addEventListener('change', applyAppearance);

function appendText(element, value) {
  for (const [i, piece] of value.split(/\*\*([^*\n]+)\*\*/g).entries()) {
    if (i % 2 === 0) {
      element.append(piece);
    } else {
      const strong = document.createElement('strong');
      strong.textContent = piece;
      element.append(strong);
    }
  }
}

function displayAnswer(value) {
  let list;
  for (const raw of value.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { list = null; continue; }
    const bullet = line.match(/^(?:([-*•])|(\d+)[.)])\s+(.+)$/);
    if (bullet) {
      const tag = bullet[2] ? 'OL' : 'UL';
      if (list?.tagName !== tag) {
        list = document.createElement(tag);
        answerText.append(list);
      }
      const item = document.createElement('li');
      appendText(item, bullet[3]);
      list.append(item);
    } else {
      list = null;
      const paragraph = document.createElement('p');
      appendText(paragraph, line.replace(/^#{1,6}\s+/, ''));
      answerText.append(paragraph);
    }
  }
}

function sourceUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}

function showResult(title, answer = '', sources = [], demo = false, busy = false) {
  result.hidden = false;
  result.setAttribute('aria-busy', String(busy));
  resultTitle.textContent = title;
  answerMode.hidden = !demo;
  loading.hidden = !busy;
  answerText.replaceChildren();
  if (answer) displayAnswer(answer);
  sourcesList.replaceChildren();
  for (const source of sources) {
    const item = document.createElement('li');
    item.append(makeIcon('file'));
    const url = sourceUrl(source.url);
    const label = document.createElement(url ? 'a' : 'span');
    if (url) {
      label.href = url;
      label.target = '_blank';
      label.rel = 'noopener noreferrer';
    }
    label.textContent = source.document;
    item.append(label);
    const locators = [];
    if (source.page) locators.push('صفحة ' + source.page);
    if (source.article) locators.push('مادة ' + source.article);
    if (!locators.length && source.section) locators.push(source.section);
    if (locators.length) {
      const locator = document.createElement('span');
      locator.className = 'locator';
      locator.textContent = '· ' + locators.join(' · ');
      item.append(locator);
    }
    sourcesList.append(item);
  }
  sourceSection.hidden = sources.length === 0;
}

function checkStatus(response) {
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response;
}

function postJson(url, payload, signal) {
  const headers = { 'Content-Type': 'application/json' };
  if (new URL(url, document.baseURI).hostname.endsWith('.ngrok-free.dev')) {
    headers['ngrok-skip-browser-warning'] = '1';
  }
  return fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal,
  });
}

async function askGradio(config, value, signal) {
  const base = new URL(config.url);
  base.search = '';
  base.hash = '';
  const rootUrl = base.href.replace(/\/+$/, '');
  const endpoint = config.endpoint.replace(/^\//, '');
  let path = rootUrl + '/gradio_api/call/' + endpoint;
  let ticket = await postJson(path, { data: [value] }, signal);
  if (ticket.status === 404) {
    path = rootUrl + '/call/' + endpoint;
    ticket = await postJson(path, { data: [value] }, signal);
  }
  const { event_id: id } = await checkStatus(ticket).json();
  if (typeof id !== 'string' || !id) throw new Error('Missing Gradio event ID');
  const response = checkStatus(await fetch(path + '/' + encodeURIComponent(id), { signal }));
  for (const event of (await response.text()).replace(/\r\n/g, '\n').split('\n\n')) {
    const lines = event.split('\n');
    if (lines.includes('event: error')) throw new Error('Gradio error');
    if (lines.includes('event: complete')) {
      return JSON.parse(lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n'))[0];
    }
  }
  throw new Error('Missing Gradio result');
}

async function fetchAnswer(value) {
  const signal = AbortSignal.timeout(45000);
  const payload = backend.kind === 'gradio'
    ? await askGradio(backend, value, signal)
    : await checkStatus(await postJson(backend.url, { question: value }, signal)).json();
  const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
  if (data?.status === 'insufficient_evidence') return null;
  if ((!data?.status || data.status === 'ok') && typeof data?.answer === 'string' && data.answer.trim()) {
    const sources = (Array.isArray(data.sources) ? data.sources : []).filter((source) =>
      typeof source?.document === 'string' && source.document.trim() &&
      (source.page || source.article || source.section || sourceUrl(source.url))
    );
    return { answer: data.answer, sources };
  }
  throw new Error('Invalid answer payload');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (asking) return;
  const value = input.value.trim();
  if (!value) {
    input.setCustomValidity('اكتب سؤالك أولاً.');
    input.reportValidity();
    return;
  }
  hideCompletion();
  setActive(true);
  if (!backend.url) {
    const match = prompts.find((entry) => entry.sample && normalized(entry.question) === normalized(value));
    if (match) {
      showResult('الجواب', match.sample.answer, match.sample.sources, true);
    } else {
      showResult('خدمة الإجابة قيد التجهيز', 'تقدر تجرّب واحد من الأسئلة الشائعة من «سؤال جديد».', [], true);
    }
    return;
  }

  asking = true;
  askButton.disabled = true;
  newQuestion.disabled = true;
  interactionStatus.textContent = 'جاري البحث عن الجواب.';
  showResult('عم نبحث عن الجواب…', '', [], false, true);
  try {
    const data = await fetchAnswer(value);
    if (data) showResult('الجواب', data.answer, data.sources);
    else showResult('المعلومة غير متوفرة', 'ما لقينا جواب كافي في المصادر المتاحة. تواصل مع دائرة القبول والتسجيل.');
  } catch {
    showResult('تعذّر جلب الجواب', 'جرّب إرسال سؤالك مرة ثانية بعد شوي.');
  } finally {
    asking = false;
    askButton.disabled = false;
    newQuestion.disabled = false;
    interactionStatus.textContent = '';
  }
});
