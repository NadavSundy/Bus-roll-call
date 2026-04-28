import type { FC } from 'react'

interface BusSelectorProps {
  buses: number[]
  selectedBus: number
  onChange: (bus: number) => void
}

const BusSelector: FC<BusSelectorProps> = ({ buses, selectedBus, onChange }) => {
  return (
    <div className="bus-selector" role="tablist" aria-label="Bus selection">
      {buses.map((bus) => (
        <button
          key={bus}
          type="button"
          className={bus === selectedBus ? 'bus-button active' : 'bus-button'}
          onClick={() => onChange(bus)}
          aria-pressed={bus === selectedBus}
        >
          Bus {bus}
        </button>
      ))}
    </div>
  )
}

export default BusSelector
