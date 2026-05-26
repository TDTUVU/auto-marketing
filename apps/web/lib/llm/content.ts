import OpenAI from 'openai'

const client = new OpenAI()

const SYSTEM_PROMPT = `Bạn là chuyên gia viết content mạng xã hội cho cửa hàng Việt Nam.
Viết caption tự nhiên, phù hợp văn hóa Việt, có emoji vừa phải.
Tone: thân thiện, gần gũi. Luôn có call-to-action cuối bài.`

export interface ContentInput {
  platform: 'facebook' | 'instagram' | 'twitter' | 'tiktok'
  idea: string
  imageDescription?: string
  shopName?: string
  tone?: 'friendly' | 'professional' | 'fun'
}

export interface GeneratedContent {
  caption: string
  hashtags: string[]
  suggestedPostTime?: string
}

export interface ProductInfo {
  name: string
  description: string
  price?: number
  category?: string
}

export interface ReplyInput {
  shopName?: string
  postContent: string
  commentText: string
  tone?: 'friendly' | 'professional' | 'fun'
  products?: ProductInfo[]
  skipSpam?: boolean
}

interface ReplyResult {
  intent: 'price_inquiry' | 'availability' | 'compliment' | 'question' | 'spam' | 'other'
  reply: string
  skip: boolean
}

const REPLY_SYSTEM_PROMPT = `Bạn là nhân viên chăm sóc khách hàng cho cửa hàng Việt Nam trên Facebook.
Nhiệm vụ: phân tích comment của khách và reply phù hợp.

Quy tắc:
- Reply ngắn gọn (1-3 câu), tự nhiên như người thật, có emoji vừa phải
- Nếu khách hỏi giá → trả lời CHÍNH XÁC giá từ catalog, không bịa số
- Nếu khách hỏi size/màu/chi tiết → trả lời từ mô tả sản phẩm
- Nếu khách khen → cảm ơn chân thành, ngắn gọn
- Nếu comment spam/không liên quan → đánh dấu skip
- KHÔNG dùng template cứng nhắc kiểu "Cảm ơn quý khách đã quan tâm"
- Viết như người Việt chat Facebook bình thường`

export async function generateCommentReply(input: ReplyInput): Promise<ReplyResult> {
  const productCatalog = input.products?.length
    ? input.products.map((p) => {
        let line = `- ${p.name}: ${p.description}`
        if (p.price) line += ` | Giá: ${p.price.toLocaleString('vi-VN')}đ`
        if (p.category) line += ` | Danh mục: ${p.category}`
        return line
      }).join('\n')
    : 'Không có thông tin sản phẩm'

  const prompt = `Cửa hàng: ${input.shopName ?? 'shop'}

=== CATALOG SẢN PHẨM ===
${productCatalog}

=== BÀI ĐĂNG ===
${input.postContent}

=== COMMENT CỦA KHÁCH ===
${input.commentText}

=== YÊU CẦU ===
Tone: ${input.tone ?? 'friendly'}
1. Phân loại intent của comment: price_inquiry, availability, compliment, question, spam, other
2. Nếu spam hoặc không liên quan → skip: true, reply: ""
3. Nếu không → viết reply phù hợp, dùng thông tin từ catalog nếu cần

Trả về JSON: { "intent": "...", "reply": "...", "skip": false }`

  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: REPLY_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    })
    const text = completion.choices[0]?.message.content ?? '{}'
    const parsed = JSON.parse(text) as Partial<ReplyResult>

    return {
      intent: parsed.intent ?? 'other',
      reply: parsed.reply ?? '',
      skip: input.skipSpam ? (parsed.skip ?? false) : false,
    }
  } catch {
    return { intent: 'other', reply: '', skip: false }
  }
}

export async function generateContent(input: ContentInput): Promise<GeneratedContent> {
  const completion = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildPrompt(input) },
    ],
    response_format: { type: 'json_object' },
  })

  const text = completion.choices[0]?.message.content ?? '{}'
  return parseResponse(text)
}

function buildPrompt(input: ContentInput): string {
  return `
Platform: ${input.platform}
Ý tưởng: ${input.idea}
${input.imageDescription ? `Mô tả ảnh: ${input.imageDescription}` : ''}
${input.shopName ? `Tên cửa hàng: ${input.shopName}` : ''}
Tone: ${input.tone ?? 'friendly'}

Hãy tạo:
1. Caption hoàn chỉnh (phù hợp độ dài của ${input.platform})
2. 5-10 hashtags liên quan
3. Thời điểm đăng bài tốt nhất trong ngày

Trả về JSON với format: { "caption": "...", "hashtags": [...], "suggestedPostTime": "..." }
`.trim()
}

function parseResponse(text: string): GeneratedContent {
  try {
    return JSON.parse(text) as GeneratedContent
  } catch {
    return { caption: text, hashtags: [] }
  }
}
