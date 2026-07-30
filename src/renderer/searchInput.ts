export type SearchInputControl = {
  focus: () => void
  select: () => void
}

export function activateSearchInput(input: SearchInputControl | null): void {
  if (!input) {
    return
  }

  input.focus()
  input.select()
}
