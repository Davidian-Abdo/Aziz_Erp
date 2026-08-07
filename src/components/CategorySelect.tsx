import { Field, inputClass } from '@/components/Field'

/*
 * Picking an article category.
 *
 * The contents hint travels with the choice, on purpose. A category is a basket
 * and a delivery is one product in it (domain-spec §1.4, limitation 5), so
 * "Produits laitiers" alone lets the user think of the milk crate in their
 * hands; "lait, fromage, yaourt, beurre" is what makes the shelf visible before
 * the stock question is ever asked.
 */

export type SelectableCategory = { id: string; name: string; description: string }

type CategorySelectProps = {
  label: string
  categories: SelectableCategory[]
  value: string
  onChange: (id: string) => void
  error?: string | null
  placeholder: string
}

export function CategorySelect({
  label,
  categories,
  value,
  onChange,
  error,
  placeholder,
}: CategorySelectProps) {
  const selected = categories.find((c) => c.id === value)

  return (
    <Field label={label} error={error}>
      {({ id, describedBy }) => (
        <>
          <select
            id={id}
            aria-describedby={describedBy}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          >
            <option value="">{placeholder}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {selected?.description && <p className="text-xs opacity-70">{selected.description}</p>}
        </>
      )}
    </Field>
  )
}
