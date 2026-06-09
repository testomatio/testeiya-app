"use client"

import { cn } from "@/lib/utils"
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Book,
  Bookmark,
  Bot,
  Brain,
  CheckCircle,
  CheckCircle2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  CircleDot,
  Circle,
  Dot,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Code,
  Copy,
  CornerDownLeft,
  Download,
  Edit,
  ExternalLink,
  Eye,
  EyeOff,
  File,
  FileText,
  FolderOpen,
  GitCommit,
  Globe,
  Image,
  Info,
  KeyRound,
  ListChecks,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  Mail,
  Mars,
  MessageCircle,
  Mic,
  Minus,
  Moon,
  MoreHorizontal,
  Music,
  Package,
  Paperclip,
  Pause,
  Phone,
  Play,
  Plus,
  Save,
  Search,
  Settings,
  Sparkles,
  Square,
  Star,
  Sun,
  Terminal,
  Trash,
  Trash2,
  Upload,
  User,
  Venus,
  Video,
  Wrench,
  XCircle,
  X,
  Zap,
  Monitor,
  Expand,
  Minimize2,
  Pencil,
  Blocks,
  type LucideProps as LucidePropsBase,
} from "lucide-react"

export type LucideIcon = React.ComponentType<{ className?: string }>
export type LucideProps = { className?: string }

export { AlertCircle }
export { Code }
export { Square }
export { Trash }
export { Monitor }
export { Expand }
export { Minimize2 }
export { Pencil }
export { Blocks }
export { X }

export const AlertTriangleIcon = AlertTriangle
export const ArrowDownIcon = ArrowDown
export const ArrowLeftIcon = ArrowLeft
export const ArrowRightIcon = ArrowRight
export const ArrowUpRightIcon = ArrowUpRight
export const BookIcon = Book
export const BookmarkIcon = Bookmark
export const BotIcon = Bot
export const BrainIcon = Brain
export const CheckCircle2Icon = CheckCircle2
export const CheckCircleIcon = CheckCircle
export const CheckIcon = Check
export const ChevronDownIcon = ChevronDown
export const ChevronLeftIcon = ChevronLeft
export const ChevronRightIcon = ChevronRight
export const ChevronUpIcon = ChevronUp
export const ChevronsUpDownIcon = ChevronsUpDown
export const CircleDotIcon = CircleDot
export const CircleIcon = Circle
export const CircleSmallIcon = Dot
export const ClipboardCheckIcon = ClipboardCheck
export const ClipboardListIcon = ClipboardList
export const ClockIcon = Clock
export const CopyIcon = Copy
export const CornerDownLeftIcon = CornerDownLeft
export const DotIcon = Dot
export const DownloadIcon = Download
export const EditIcon = Edit
export const ExternalLinkIcon = ExternalLink
export const EyeIcon = Eye
export const EyeOffIcon = EyeOff
export const FileIcon = File
export const FileTextIcon = FileText
export const FolderOpenIcon = FolderOpen
export const GitCommitIcon = GitCommit
export const GlobeIcon = Globe
export const ImageIcon = Image
export const InfoIcon = Info
export const KeyRoundIcon = KeyRound
export const ListChecksIcon = ListChecks
export const LockIcon = Lock
export const LogInIcon = LogIn
export const LogOutIcon = LogOut
export const MailIcon = Mail
export const MarsIcon = Mars
export const MarsStrokeIcon = Mars
export const MessageCircleIcon = MessageCircle
export const MicIcon = Mic
export const MinusIcon = Minus
export const MoonIcon = Moon
export const MoreHorizontalIcon = MoreHorizontal
export const Music2Icon = Music
export const NonBinaryIcon = Circle
export const PackageIcon = Package
export const PaperclipIcon = Paperclip
export const PauseIcon = Pause
export const PhoneIcon = Phone
export const PlayIcon = Play
export const PlusIcon = Plus
export const SaveIcon = Save
export const SearchIcon = Search
export const SettingsIcon = Settings
export const SparklesIcon = Sparkles
export const SquareIcon = Square
export const StarIcon = Star
export const SunIcon = Sun
export const TerminalIcon = Terminal
export const Trash2Icon = Trash2
export const TrashIcon = Trash
export const UploadIcon = Upload
export const UserIcon = User
export const VenusAndMarsIcon = Circle
export const VenusIcon = Venus
export const VideoIcon = Video
export const WrenchIcon = Wrench
export const XCircleIcon = XCircle
export const XIcon = X
export const ZapIcon = Zap

export function Loader2Icon({ className }: LucideProps) {
  return <Loader2 className={cn("animate-spin", className)} />
}

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
