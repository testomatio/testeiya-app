import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"

function Spinner({ className }: { className?: string }) {
  return (
    <Loader2 role="status" aria-label="Loading" className={cn("animate-spin size-4", className)} />
  )
}

export { Spinner }
