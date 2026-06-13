import { cn } from "@/lib/utils"

function Spinner({ className }: { className?: string }) {
  return (
    <span role="status" aria-label="Loading" className={cn("material-symbols-rounded animate-spin size-4", className)}>autorenew</span>
  )
}

export { Spinner }
