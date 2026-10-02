export type ApiRoom = {
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
  kind: "general" | "public" | "private";
  createdAt: string;
  memberCount: number;
  createdById?: string;
};

export type ApiAttachment = {
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

export type ApiReactionType = "like" | "dislike" | "laugh" | "disgust" | "love" | "surprise" | "sad";

export type ApiReaction = {
  type: ApiReactionType;
  count: number;
  mine: boolean;
};

export type ReactionUpdate = {
  messageId: string;
  userId: string;
  selected: ApiReactionType | null;
  reactions: Array<{ type: ApiReactionType; count: number }>;
  roomId?: string;
  participantIds?: string[];
};
export type ApiMessage = {
  quizKind?: string;
  quizRoundId?: string;
  id: string | number;
  authorId?: string;
  author: string;
  appearance?: Record<string, Record<string, string | boolean>>;
  avatarUrl?: string;
  body: string;
  gifUrl?: string;
  time: string;
  createdAt?: string;
  adminVoice?: boolean;
  mine?: boolean;
  system?: boolean;
  attachments: ApiAttachment[];
  reactions: ApiReaction[];
  replyTo?: { id: string; authorId?: string; author: string; time: string; createdAt?: string };
};

export type ApiPerson = {
  isDj?: boolean;
  id: string;
  username: string;
  name: string;
  status: "online" | "away" | "dnd" | "offline";
  gender: "male" | "female" | "unspecified";
  role?: string;
  room: string;
  avatar: string;
  isBot?: boolean;
  isGuest: boolean;
  avatarThumbnail?: string;
  appearance?: Record<string, Record<string, string | boolean>>;
};

export type DirectConversation = {
  peer: ApiPerson;
  lastMessage: ApiMessage;
  unread: number;
  updatedAt: string;
};

export type RoomSnapshot = {
  room: ApiRoom;
  messages: ApiMessage[];
  people: [];
};
