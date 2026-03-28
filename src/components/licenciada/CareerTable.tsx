interface CareerTableProps {
  items: string[];
  label?: string;
}

const CareerTable = ({ items, label }: CareerTableProps) => (
  <div className="glass-card mt-6">
    {label && <h4 className="font-heading font-bold text-base mb-4" style={{ color: 'hsl(var(--accent))' }}>{label}</h4>}
    <div className="grid sm:grid-cols-2 gap-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2 text-sm text-foreground/80 py-1.5 px-3 rounded-lg bg-muted/50">
          <span className="glow-dot !w-2 !h-2" />
          <span>{item}</span>
        </div>
      ))}
    </div>
  </div>
);

export default CareerTable;
