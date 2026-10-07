export type UserStatus = "online" | "away" | "dnd" | "offline";
export type UserRole = "user" | "moderator" | "admin";
export type Gender = "male" | "female" | "unspecified";
export type ParticipantBadge = string;
export type CosmeticAppearance = Record<string, Record<string, string | boolean>>;

export type Attachment = {
  id: string;
  kind: "image" | "audio";
  status: "pending" | "approved" | "rejected";
  mimeType: string;
  originalName: string;
  size: number;
  url: string;
  previewUrl?: string;
  createdAt: string;
  expiresAt?: string;
};

export type ReactionType = "like" | "dislike" | "laugh" | "disgust" | "love" | "surprise" | "sad";

export type Reaction = {
  type: ReactionType;
  count: number;
  mine: boolean;
};

export type ReactionUpdate = {
  messageId: string | null;
  profilePostId?: string | null;
  giftInventoryId?: string | null;
  photoId?: string | null;
  userId: string;
  selected: ReactionType | null;
  reactions: Array<{ type: ReactionType; count: number }>;
};

export type NotificationItem = {
  id: string;
  type: "reply" | "reaction" | "mention" | "gift" | "profile_post" | "profile_post_reply" | "mute" | "unmute" | "ban" | "unban" | "photo_like" | "photo_comment";
  actor: { id: string; name: string; avatar: string };
  messageId: string;
  roomId: string | null;
  peerId: string | null;
  preview: string;
  photoThumbnailUrl?: string | null;
  reactionType: ReactionType | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationFeed = {
  unread: number;
  items: NotificationItem[];
};
export type PublicProfile = {
  hideRole?: boolean;
  hideDj?: boolean;
  isDj?: boolean;
  id: string; username: string; displayName: string; bio: string | null; avatarUrl: string | null; avatarThumbnailUrl: string | null;
  rating: number; role: UserRole; status: UserStatus; gender: Gender; createdAt: string; appearance?: CosmeticAppearance;
  albums: Array<{ id: string; title: string; createdAt: string; photos: Array<{ id: string; originalName: string; url: string; thumbnailUrl: string; size: number; createdAt: string }> }>;
  gifts: Array<{ id: string; createdAt: string; message: string | null; gift: GiftCatalogItem; sender: { id: string; displayName: string } | null }>;
  communities: Array<{ id: string; name: string; role: string }>;
  rooms: Array<{ id: string; name: string }>;
  stats: { messages: number; profilePosts: number };
};

export type FriendSummary = {
  id: string; username: string; displayName: string; avatarUrl: string | null;
  status: UserStatus; role: UserRole; gender: Gender; friendsSince: string;
};

export type ProfilePost = {
  id: string;
  profileUserId: string;
  parentId: string | null;
  body: string;
  createdAt: string;
  attachment: Attachment | null;
  author: { id: string; username: string; displayName: string; avatarUrl: string | null };
  likeCount: number;
  likedByMe: boolean;
  replies: ProfilePost[];
};

export type AdminOverview = {
  users: number;
  rooms: number;
  messages: number;
  openReports: number;
  pendingAttachments: number;
  profilePosts: number;
};

export type AdminUser = {
  isDj?: boolean;
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  _count: { messages: number; reportsReceived: number };
};

export type PendingAttachment = Attachment & {
  uploader: { id: string; username: string; displayName: string };
  message: { id: string; body: string } | null;
};



export type AuthUser = {
  hideRole?: boolean;
  hideDj?: boolean;
  isDj?: boolean;
  isGuest?: boolean;
  id: string;
  username: string;
  displayName: string;
  email?: string | null;
  emailVerified?: boolean;
  role: UserRole;
  status: UserStatus;
  gender: Gender;
  mutedUntil: string | null;
  chaosUntil: string | null;
  bio: string | null;
  avatarUrl: string | null;
  avatarThumbnailUrl: string | null;
  rating: number;
  credits: number;
  appearance?: CosmeticAppearance;
};

export type Room = {
  id: string;
  name: string;
  description: string;
  online: number;
  tone: string;
  coverEmoji: string;
  coverUrl?: string;
  coverThumbnailUrl?: string;
  rules: string;
  visibility: "public" | "private";
  kind: "general" | "public" | "private" | "video";
  isVideoRoom: boolean;
  createdAt: string;
  memberCount: number;
  createdById?: string;
};

export type VideoQueueItem = { id: string; ownerId: string; ownerName: string; provider: "youtube" | "vk" | "rutube"; videoUrl: string; title: string; createdAt: string };
export type VideoRoomState = { roomId: string; provider: "youtube" | "vk" | "rutube" | null; videoUrl: string | null; controllerId: string | null; currentItemId: string | null; position: number; playing: boolean; updatedAt: string; queuePrice: number; queue: VideoQueueItem[] };
export type Message = {
  quizKind?: string;
  quizRoundId?: string;
  id: string | number;
  authorId?: string;
  author: string;
  appearance?: CosmeticAppearance;
  avatarUrl?: string;
  body: string;
  gifUrl?: string;
  adminVoice?: boolean;
  time: string;
  createdAt?: string;
  editedAt?: string;
  mine?: boolean;
  system?: boolean;
  greetingRecipientId?: string;
  attachments?: Attachment[];
  reactions?: Reaction[];
  replyTo?: { id: string; authorId?: string; author: string; body: string; time: string; createdAt?: string };
};

export type Person = {
  hideRole?: boolean;
  hideDj?: boolean;
  isDj?: boolean;
  id?: string;
  username?: string;
  name: string;
  status: UserStatus;
  gender: Gender;
  role?: string;
  isBot?: boolean;
  isGuest?: boolean;
  participantBadge?: ParticipantBadge;
  room: string;
  avatar: string;
  avatarThumbnail?: string;
  appearance?: CosmeticAppearance;
};

export type DirectConversation = {
  peer: Person;
  lastMessage: Message;
  unread: number;
  updatedAt: string;
};

export type ClientToServerEvents = {
  "room:join": { roomId: string };
  "room:leave": { roomId: string };
  "message:send": { roomId: string; body?: string; requestId: string; attachmentId?: string; replyToId?: string; adminVoice?: boolean };
  "direct:send": { recipientId: string; body?: string; requestId: string; attachmentId?: string; replyToId?: string };
  "presence:update": { status: UserStatus };
  "presence:active": undefined;
  "video:get": { roomId: string };
  "video:set": { roomId: string; videoUrl: string };
  "video:control": { roomId: string; action: "play" | "pause" | "seek"; position?: number };
  "video:remove": { roomId: string; itemId: string };
  "video:ended": { roomId: string; itemId: string };
  "video:title": { roomId: string; itemId: string; title: string };
};

export type ServerToClientEvents = {
  "room:snapshot": { room: Room; messages: Message[]; people: Person[]; videoSession?: VideoRoomState };
  "video:state": VideoRoomState;
  "message:created": { roomId: string; message: Message; requestId?: string };
  "direct:created": { peerId: string; message: Message; requestId?: string };
  "message:updated": { message: Message };
  "presence:changed": { userId: string; status: UserStatus };
  "moderation:changed": { mutedUntil: string | null; banned: boolean };
  "chaos:changed": { chaosUntil: string | null; actorName?: string };
  "reaction:updated": ReactionUpdate;
  "notification:changed": undefined;
  error: { code: string; message: string; requestId?: string };
};


export type ReportReason = "SPAM" | "HARASSMENT" | "IMPERSONATION" | "ILLEGAL" | "OTHER";
export type ReportStatus = "OPEN" | "REVIEWED" | "DISMISSED" | "ACTIONED";
export type CompactUser = { id: string; username: string; displayName: string };
export type Report = {
  canRestrictTarget?: boolean;
  id: string;
  reporterId: string;
  targetUserId: string | null;
  messageId: string | null;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
  reporter: CompactUser;
  targetUser: CompactUser | null;
  message: { id: string; authorId: string | null; authorName: string; body: string; roomId: string | null; createdAt: string } | null;
  handledBy: CompactUser | null;
};
export type AuditEntry = {
  id: string;
  action: string;
  targetUserId: string | null;
  messageId: string | null;
  reportId: string | null;
  details: unknown;
  createdAt: string;
  actor: CompactUser;
  targetUser: CompactUser | null;
};

export type CommunityRole="owner"|"moderator"|"member";export type CommunityMembershipStatus="pending"|"approved";export type Community={coverUrl?:string|null;messagesLastDay?:number;memberPreview?:Array<{id:string;displayName:string;avatarUrl:string|null}>;id:string;name:string;description:string;joinPolicy:"open"|"approval";createdById:string;createdAt:string;memberCount:number;membership:{role:CommunityRole;status:CommunityMembershipStatus}|null};export type CommunityMember={id:string;username:string;displayName:string;avatarUrl:string|null;avatarThumbnailUrl?:string|null;role:CommunityRole;siteRole?:UserRole;status:"online"|"away"|"dnd"|"offline";gender:Gender;isBot:boolean;appearance?:CosmeticAppearance};export type CommunityRequest={id:string;displayName:string;avatarUrl:string|null;createdAt:string};export type CommunityPost={id:string;body:string;createdAt:string;author:{id:string;displayName:string;avatarUrl:string|null;appearance?:CosmeticAppearance}};export type CommunityDetail=Community&{members:CommunityMember[];posts:CommunityPost[]};

export type CommunityTopic={id:string;name:string;createdAt:string};
export type CommunityMessage={id:string;body:string;createdAt:string;topic:{id:string;name:string}|null;attachment:Attachment|null;author:{id:string;displayName:string;avatarUrl:string|null;appearance?:CosmeticAppearance}};

export type EconomyBalance={rating:number;credits:number};export type GiftCatalogItem={id:string;categoryId:string;name:string;description:string;emoji:string;price:number;kind?:"gift"|"cosmetic";effectKey?:string|null;imageUrl?:string|null};
export type StoreCategory={id:string;name:string;description:string;icon:string;imageUrl:string|null;active:boolean;position:number;createdAt:string};export type GiftInventoryItem={id:string;createdAt:string;gift:GiftCatalogItem;sender:{id:string;displayName:string}|null};
export type RoomResourceItem = { messageId: string; author: string; createdAt: string; attachment: Attachment };
export type RoomResources = { media: RoomResourceItem[]; files: RoomResourceItem[]; links: Array<{ messageId: string; author: string; createdAt: string; url: string }> };
