interface CareerTableProps {
  items: string[];
  label?: string;
}

const CareerTable = ({ items, label }: CareerTableProps) => (
  <div className="mb-8">
    {label && <p className="text-foreground/80 mb-4">{label}</p>}
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="benefit-item"><span>{item}</span></div>
      ))}
    </div>
  </div>
);

export default CareerTable;
