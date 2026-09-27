import { Bird, BookOpen, Cake, CakeSlice, Candy, Cat, Clapperboard, Coffee, Crown, CupSoda, Dice5, Dumbbell, Film, Flower2, Gamepad2, Gem, Gift, GlassWater, Heart, HeartHandshake, House, Images, Laugh, Music2, Paintbrush, Palette, PartyPopper, PawPrint, Plane, Rocket, ShoppingBag, Sparkles, Star, Ticket, TreePine, Tv, Type, UtensilsCrossed } from "lucide-react";
import type { StoreCategory } from "@/lib/chat-contract";

const icons = {
  gift: Gift, crown: Crown, type: Type, palette: Palette, images: Images, star: Star, heart: Heart,
  sparkles: Sparkles, gem: Gem, ticket: Ticket, "shopping-bag": ShoppingBag,
  coffee: Coffee, "cup-soda": CupSoda, "flower-2": Flower2, candy: Candy, "cake-slice": CakeSlice,
  "utensils-crossed": UtensilsCrossed, "glass-water": GlassWater, "book-open": BookOpen, "music-2": Music2,
  film: Film, clapperboard: Clapperboard, tv: Tv, "gamepad-2": Gamepad2, "dice-5": Dice5,
  "paw-print": PawPrint, cat: Cat, bird: Bird, rocket: Rocket, "tree-pine": TreePine,
  plane: Plane, "party-popper": PartyPopper, cake: Cake, "heart-handshake": HeartHandshake,
  house: House, laugh: Laugh, dumbbell: Dumbbell, paintbrush: Paintbrush,
};
export const storeIconOptions = [
  ["gift", "Подарок"], ["crown", "Корона"], ["type", "Текст"], ["palette", "Палитра"], ["images", "Фото"],
  ["star", "Звезда"], ["heart", "Сердце"], ["sparkles", "Искры"], ["gem", "Кристалл"], ["ticket", "Билет"], ["shopping-bag", "Покупки"],
  ["coffee", "Кофе"], ["cup-soda", "Чашка"], ["flower-2", "Цветок"], ["candy", "Конфета"], ["cake-slice", "Десерт"],
  ["utensils-crossed", "Еда"], ["glass-water", "Напиток"], ["book-open", "Книга"], ["music-2", "Музыка"],
  ["film", "Фильм"], ["clapperboard", "Мультфильм"], ["tv", "Сериал"], ["gamepad-2", "Игра"], ["dice-5", "Настольная игра"],
  ["paw-print", "Животное"], ["cat", "Кот"], ["bird", "Сова"], ["rocket", "Космос"], ["tree-pine", "Природа"],
  ["plane", "Путешествие"], ["party-popper", "Праздник"], ["cake", "День рождения"], ["heart-handshake", "Дружба"],
  ["house", "Уют"], ["laugh", "Мем"], ["dumbbell", "Спорт"], ["paintbrush", "Арт"],
] as const;

export function StoreCategoryIcon({ category, size = 16 }: { category: Pick<StoreCategory, "name" | "icon" | "imageUrl">; size?: number }) {
  if (category.imageUrl) return <img className="store-category-image" src={category.imageUrl} alt="" width={size} height={size} />;
  const Icon = icons[category.icon as keyof typeof icons] ?? Gift;
  return <Icon size={size} aria-hidden="true" />;
}
