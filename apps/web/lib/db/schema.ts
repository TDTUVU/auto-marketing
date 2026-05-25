import { model, models, Schema, type Document, type Types } from 'mongoose'

// Account
export interface IAccount extends Document {
  platform: 'facebook' | 'instagram' | 'tiktok'
  name: string
  encryptedSession: string
  cookiesPath?: string
  pageId?: string
  createdAt: Date
}

const AccountSchema = new Schema<IAccount>(
  {
    platform: { type: String, enum: ['facebook', 'instagram', 'tiktok'], required: true },
    name: { type: String, required: true },
    encryptedSession: { type: String, default: '' },
    cookiesPath: { type: String },
    pageId: { type: String },
  },
  { timestamps: true }
)

export const Account = models['Account'] ?? model<IAccount>('Account', AccountSchema)

// Post
export interface IPost extends Document {
  accountId: Types.ObjectId
  content: string
  imageUrls: string[]
  status: 'draft' | 'scheduled' | 'published' | 'failed'
  scheduledAt?: Date
  publishedAt?: Date
  platformPostId?: string
  errorMessage?: string
  createdAt: Date
}

const PostSchema = new Schema<IPost>(
  {
    accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    content: { type: String, required: true },
    imageUrls: [{ type: String }],
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'published', 'failed'],
      default: 'draft',
    },
    scheduledAt: Date,
    publishedAt: Date,
    platformPostId: String,
    errorMessage: String,
  },
  { timestamps: true }
)

export const Post = models['Post'] ?? model<IPost>('Post', PostSchema)

// Content Idea
export interface IContentIdea extends Document {
  idea: string
  imageUrls: string[]
  generatedCaption?: string
  generatedHashtags: string[]
  createdAt: Date
}

const ContentIdeaSchema = new Schema<IContentIdea>(
  {
    idea: { type: String, required: true },
    imageUrls: [{ type: String }],
    generatedCaption: String,
    generatedHashtags: [{ type: String }],
  },
  { timestamps: true }
)

export const ContentIdea =
  models['ContentIdea'] ?? model<IContentIdea>('ContentIdea', ContentIdeaSchema)

// Comment (tracking replied comments để không reply trùng)
export interface IComment extends Document {
  postId: Types.ObjectId
  facebookCommentId: string
  authorId: string
  authorName: string
  text: string
  repliedAt?: Date
  replyText?: string
  createdAt: Date
}

const CommentSchema = new Schema<IComment>(
  {
    postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    facebookCommentId: { type: String, required: true, unique: true },
    authorId: { type: String, required: true },
    authorName: { type: String, default: '' },
    text: { type: String, required: true },
    repliedAt: Date,
    replyText: String,
  },
  { timestamps: true }
)

export const Comment = models['Comment'] ?? model<IComment>('Comment', CommentSchema)

// Product (Content Library / Catalog)
export interface IProduct extends Document {
  accountId: Types.ObjectId
  name: string
  description: string
  imageUrls: string[]
  price?: number
  category?: string
  isActive: boolean
  lastPostedAt?: Date
  postCount: number
  createdAt: Date
}

const ProductSchema = new Schema<IProduct>(
  {
    accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    imageUrls: [{ type: String }],
    price: Number,
    category: String,
    isActive: { type: Boolean, default: true },
    lastPostedAt: Date,
    postCount: { type: Number, default: 0 },
  },
  { timestamps: true }
)

export const Product = models['Product'] ?? model<IProduct>('Product', ProductSchema)

// AutoPilot Config
export interface IAutoPilotConfig extends Document {
  accountId: Types.ObjectId
  enabled: boolean
  postsPerDay: number
  postTimes: string[]
  tone: 'friendly' | 'professional' | 'fun'
  minIntervalDays: number
  categories: string[]
  autoReplyEnabled: boolean
  replyTone: 'friendly' | 'professional' | 'fun'
  skipSpam: boolean
  createdAt: Date
}

const AutoPilotConfigSchema = new Schema<IAutoPilotConfig>(
  {
    accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true, unique: true },
    enabled: { type: Boolean, default: false },
    postsPerDay: { type: Number, default: 2, min: 1, max: 10 },
    postTimes: { type: [String], default: ['09:00', '19:00'] },
    tone: {
      type: String,
      enum: ['friendly', 'professional', 'fun'],
      default: 'friendly',
    },
    minIntervalDays: { type: Number, default: 7, min: 1 },
    categories: { type: [String], default: [] },
    autoReplyEnabled: { type: Boolean, default: false },
    replyTone: {
      type: String,
      enum: ['friendly', 'professional', 'fun'],
      default: 'friendly',
    },
    skipSpam: { type: Boolean, default: true },
  },
  { timestamps: true }
)

export const AutoPilotConfig =
  models['AutoPilotConfig'] ?? model<IAutoPilotConfig>('AutoPilotConfig', AutoPilotConfigSchema)

// Automation Log
export interface IAutomationLog extends Document {
  postId?: Types.ObjectId
  action: string
  success: boolean
  detail?: string
  timestamp: Date
}

const AutomationLogSchema = new Schema<IAutomationLog>({
  postId: { type: Schema.Types.ObjectId, ref: 'Post' },
  action: { type: String, required: true },
  success: { type: Boolean, required: true },
  detail: String,
  timestamp: { type: Date, default: Date.now },
})

export const AutomationLog =
  models['AutomationLog'] ?? model<IAutomationLog>('AutomationLog', AutomationLogSchema)
