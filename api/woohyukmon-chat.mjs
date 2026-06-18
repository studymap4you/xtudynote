const WOOHYUKMON_SYSTEM_PROMPT = `
너는 Xuniverse의 AI 학습 도우미 '우혁몬'이다.
너의 역할은 한국인 사용자와 외국인 사용자 모두가 Xuniverse 사이트를 잘 활용하도록 돕는 것이다.

우혁몬의 정체성:
- Xuniverse의 대표 AI 학습 파트너
- 한국인에게는 영어 학습과 교재 제작을 도와주는 AI
- 외국인에게는 한국어와 한국문화를 쉽게 알려주는 AI
- 사이트 사용법, 교재 자동 생성 기능, 학습 방향 설정을 도와주는 안내자

주요 역할:
1. 교재 자동 제작 기능 안내
2. 학습지, 워크북, 프리미엄 교재 생성 방식 설명
3. 영어 학습 조언
4. 외국인을 위한 한국어 학습 조언
5. 사이트 사용법 안내
6. 사용자의 입력을 바탕으로 학습 자료 제작 방향 제안
7. 사용자가 붙여넣은 텍스트를 어떤 교재 형태로 만들면 좋을지 조언

프리미엄 교재 생성 안내:
- XUniverse Premium Textbook Generator는 사용자가 원문/수업자료를 붙여넣거나 파일을 업로드하고, 자연어 주문을 입력한 뒤 프리미엄 템플릿을 선택해 교재형 미리보기를 만드는 기능이다.
- 주요 템플릿은 XUniverse Premium Basic과 XUniverse Academy Pro이다.
- 빠른 문제지는 "학습지 자동생성", 연습과 해설 중심 자료는 "워크북 생성", 표지·내지·개념·문제·정답·해설까지 갖춘 완성형 자료는 "프리미엄 교재 생성"을 추천한다.

언어 규칙:
- 사용자가 한국어로 질문하면 한국어로 답변한다.
- 사용자가 영어로 질문하면 자연스러운 영어로 답변한다.
- 사용자가 한국어와 영어를 섞어 쓰면 사용자의 주된 언어에 맞춰 답변한다.
- 외국인이 한국어를 배우는 질문을 하면 쉬운 영어 설명과 한국어 예문을 함께 제공한다.
- 한국인이 영어를 배우는 질문을 하면 자연스러운 영어 표현과 한국어 설명을 함께 제공한다.
- 필요하면 한국어 표현, 영어 해석, 발음 힌트, 예문, 문화적 맥락을 제공한다.
- 사용자의 언어 수준이 낮아 보이면 더 쉬운 문장으로 답변한다.
- 외국인 사용자에게는 너무 어려운 한국어 표현을 피하고, 필요하면 영어로 보충 설명한다.

말투:
- 친근하지만 가볍지만은 않게
- 학생에게 설명하듯 명확하게
- 외국인 사용자에게는 쉬운 영어를 사용
- 한국어 초급자에게는 어려운 한국어 표현을 피함
- 너무 긴 답변보다 바로 실행 가능한 답변 중심
- 모르는 정보는 추측하지 말고 확인이 필요하다고 말할 것

보안:
- API Key, 비밀번호, 토큰 등 민감정보를 요구하거나 노출하지 말 것
- 사용자가 민감정보를 입력하면 저장하거나 반복 노출하지 말고 주의하라고 안내할 것

답변 원칙:
- 사이트 내부 기능에 대해 확실하지 않은 내용은 추측하지 말고 확인이 필요하다고 말한다.
- 가능한 한 사용자가 바로 실행할 수 있는 방식으로 안내한다.
- 답변이 길어질 경우 핵심부터 말하고, 필요하면 단계별로 설명한다.
`;

function normalizeMessages(input) {
  if (!Array.isArray(input)) return [];

  return input
    .slice(-16)
    .map((message) => {
      const role = message?.role === "assistant" ? "assistant" : message?.role === "user" ? "user" : null;
      const content = String(message?.content ?? "").trim().slice(0, 3000);
      if (!role || !content) return null;
      return { role, content };
    })
    .filter(Boolean);
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const chunks = [];
  for (const item of payload?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (typeof content?.text === "string") {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join("\n").trim();
}

function mockReply(messages) {
  const last = messages[messages.length - 1]?.content ?? "";
  const hasHangul = /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(last);

  if (!hasHangul && /[A-Za-z]/.test(last)) {
    return "Hi! I'm Woohyukmon. This is a test response for now, but soon I'll help you create study materials, learn English, practice Korean, and use Xuniverse more easily.";
  }

  return "좋아! 나는 우혁몬이야. 현재는 테스트 응답 중이지만, 곧 Xuniverse의 교재 제작과 영어·한국어 학습을 더 자세히 도와줄 수 있어.";
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const messages = normalizeMessages(body.messages);

    if (body.context !== "xuniverse-site-assistant") {
      res.status(400).json({ error: "Invalid chat context" });
      return;
    }

    if (messages.length === 0 || messages[messages.length - 1]?.role !== "user") {
      res.status(400).json({ error: "User message is required" });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      // TODO: Connect this function to the secure server-side OpenAI API route.
      // Do not expose OPENAI_API_KEY in the frontend.
      res.status(200).json({ content: mockReply(messages), source: "mock" });
      return;
    }

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions: WOOHYUKMON_SYSTEM_PROMPT,
        input: messages,
        max_output_tokens: 700,
        temperature: 0.45,
      }),
    });

    if (!openAiResponse.ok) {
      const detail = await openAiResponse.text().catch(() => "");
      console.error("[woohyukmon-chat] OpenAI request failed", openAiResponse.status, detail.slice(0, 500));
      res.status(502).json({ error: "Woohyukmon could not answer right now" });
      return;
    }

    const data = await openAiResponse.json();
    const content = extractOutputText(data);

    if (!content) {
      res.status(502).json({ error: "Empty Woohyukmon response" });
      return;
    }

    res.status(200).json({ content, source: "openai" });
  } catch (error) {
    console.error("[woohyukmon-chat]", error);
    res.status(500).json({ error: "Woohyukmon chat failed" });
  }
}
