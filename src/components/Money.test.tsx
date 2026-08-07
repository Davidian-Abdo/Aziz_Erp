import { render, screen } from '@testing-library/react'
import { Money } from './Money'
import { DisplaySettingsContext } from '@/lib/display-settings'

/*
 * domain-spec §7.2 is a binding rule, not a style preference: the owner must
 * never be able to mistake a modelled figure for a measured one. These are the
 * assertions that keep it true.
 */
describe('<Money>', () => {
  it('renders a measured figure plainly, with no ≈', () => {
    render(<Money value={1234.5} kind="measured" />)
    const el = screen.getByText(/1[\s  ]?234,50/)
    expect(el).toBeInTheDocument()
    expect(el.textContent).not.toContain('≈')
    expect(el.closest('[data-kind]')).toHaveAttribute('data-kind', 'measured')
  })

  it('marks a modelled figure with ≈, a distinct tint and an explanatory tooltip', () => {
    const { container } = render(<Money value={1234.5} kind="modelled" />)

    const wrapper = container.querySelector('[data-kind="modelled"]')
    expect(wrapper).not.toBeNull()
    expect(wrapper!.textContent).toContain('≈')
    // The tint: modelled figures must not be styled identically to measured ones.
    expect(wrapper!.className).toMatch(/text-amber/)

    const tooltip = wrapper!.getAttribute('title')
    expect(tooltip).toBeTruthy()
    expect(tooltip).toMatch(/estimation/i)
  })

  it('names the markup in the tooltip when one rate explains the figure', () => {
    const { container } = render(<Money value={100} kind="modelled" markupPct={20} />)
    expect(container.querySelector('[data-kind="modelled"]')!.getAttribute('title')).toContain('20')
  })

  it('renders a missing figure as an em dash, never as zero', () => {
    // `report_period` returns 0.00 for an empty period, so a null here means the
    // number did not arrive. "0,00 MAD" would be a claim about the shop.
    render(<Money value={null} kind="measured" />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText(/0,00/)).not.toBeInTheDocument()
  })

  it('takes its currency from settings rather than hard-coding one', () => {
    render(
      <DisplaySettingsContext value={{ locale: 'fr', currencyCode: 'EUR', storeName: 'Aziz' }}>
        <Money value={10} kind="measured" />
      </DisplaySettingsContext>,
    )
    expect(screen.getByText(/€/)).toBeInTheDocument()
  })
})
