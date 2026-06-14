"use client"

import { cn } from "@/lib/utils"
import {
  Bot,
  Brain,
  Bookmark,
  Book,
  Sparkles,
  CheckCircle,
  CheckCircle2,
  XCircle,
  Circle,
  CircleDot,
  Dot,
  Clock,
  ClipboardCheck,
  ClipboardList,
  Code,
  GitCommit,
  ListChecks,
  Mars,
  MessageCircle,
  Transgender,
  Blocks,
  Music,
  Package,
  Play,
  Pause,
  Square,
  Slash,
  Star,
  Terminal,
  Venus,
  Video,
  Wrench,
  Zap,
} from "lucide-react"

export type LucideIcon = React.ComponentType<{ className?: string }>
export type LucideProps = { className?: string }

// ─── Semantic / custom icons (kept as Lucide) ────────────────────────────────
export { Code }
export { Square }
export { Blocks }

export const BotIcon = Bot
export const BrainIcon = Brain
export const BookmarkIcon = Bookmark
export const BookIcon = Book
export const SparklesIcon = Sparkles
export const CheckCircleIcon = CheckCircle
export const CheckCircle2Icon = CheckCircle2
export const XCircleIcon = XCircle
export const CircleIcon = Circle
export const CircleDotIcon = CircleDot
export const CircleSmallIcon = Dot
export const DotIcon = Dot
export const ClockIcon = Clock
export const ClipboardCheckIcon = ClipboardCheck
export const ClipboardListIcon = ClipboardList
export const GitCommitIcon = GitCommit
export const ListChecksIcon = ListChecks
export const MarsIcon = Mars
export const TransgenderIcon = Transgender
export const MarsStrokeIcon = Mars
export const MessageCircleIcon = MessageCircle
export const Music2Icon = Music
export const NonBinaryIcon = Circle
export const PackageIcon = Package
export const PauseIcon = Pause
export const PlayIcon = Play
export const SlashIcon = Slash
export const StarIcon = Star
export const VenusAndMarsIcon = Circle
export const VenusIcon = Venus
export const VideoIcon = Video
export const WrenchIcon = Wrench
export const ZapIcon = Zap

// ─── System icons — Material Symbols Rounded, wght 300, outline ──────────────
function makeIcon(name: string) {
  return function MaterialIcon({ className }: { className?: string }) {
    return <Icon name={name} className={className} />
  }
}

export const AlertCircle = makeIcon("error")
export const AlertTriangleIcon = makeIcon("warning")
export const ArrowDownIcon = makeIcon("arrow_downward")
export const ArrowLeftIcon = makeIcon("arrow_back")
export const ArrowRightIcon = makeIcon("arrow_forward")
export const ArrowUpIcon = makeIcon("arrow_upward")
export const ArrowUpRightIcon = makeIcon("north_east")
export const CameraIcon = makeIcon("photo_camera")
export const CheckIcon = makeIcon("check")
export const ChevronDownIcon = makeIcon("keyboard_arrow_down")
export const ChevronLeftIcon = makeIcon("keyboard_arrow_left")
export const ChevronRightIcon = makeIcon("keyboard_arrow_right")
export const ChevronUpIcon = makeIcon("keyboard_arrow_up")
export const ChevronsUpDownIcon = makeIcon("unfold_more")
export const CornerDownLeftIcon = makeIcon("keyboard_return")
export const CopyIcon = makeIcon("content_copy")
export const DownloadIcon = makeIcon("download")
export const EditIcon = makeIcon("edit")
export const Expand = makeIcon("open_in_full")
export const ExternalLinkIcon = makeIcon("open_in_new")
export const EyeIcon = makeIcon("visibility")
export const EyeOffIcon = makeIcon("visibility_off")
export const FileIcon = makeIcon("draft")
export const FileTextIcon = makeIcon("description")
export const FolderOpenIcon = makeIcon("folder_open")
export const GlobeIcon = makeIcon("language")
export const ImageIcon = makeIcon("image")
export const InfoIcon = makeIcon("info")
export const KeyRoundIcon = makeIcon("key")
export const LockIcon = makeIcon("lock")
export const LogInIcon = makeIcon("login")
export const LogOutIcon = makeIcon("logout")
export const MailIcon = makeIcon("mail")
export const MicIcon = makeIcon("mic")
export const Minimize2 = makeIcon("close_fullscreen")
export const MinusIcon = makeIcon("remove")
export const MonitorIcon = makeIcon("computer")
export const Monitor = makeIcon("computer")
export const MoonIcon = makeIcon("dark_mode")
export const MoreHorizontalIcon = makeIcon("more_horiz")
export const PaperclipIcon = makeIcon("attach_file")
export const Pencil = makeIcon("edit")
export const PhoneIcon = makeIcon("phone")
export const PlusIcon = makeIcon("add")
export const RotateCwIcon = makeIcon("refresh")
export const SaveIcon = makeIcon("save")
export const SearchIcon = makeIcon("search")
export const SettingsIcon = makeIcon("settings")
export const SquareIcon = makeIcon("stop")
export const SunIcon = makeIcon("light_mode")
export const TerminalIcon = makeIcon("terminal")
export const Trash = makeIcon("delete")
export const Trash2Icon = makeIcon("delete")
export const TrashIcon = makeIcon("delete")
export const UploadIcon = makeIcon("upload")
export const UserIcon = makeIcon("person")
export const X = makeIcon("close")
export const XIcon = makeIcon("close")

export function Loader2Icon({ className }: LucideProps) {
  return <Icon name="autorenew" className={cn("animate-spin", className)} />
}

// ─── Icon primitive ──────────────────────────────────────────────────────────
export function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <span
      data-slot="icon"
      aria-hidden="true"
      className={cn("material-symbols-rounded", className)}
    >
      {name}
    </span>
  )
}
