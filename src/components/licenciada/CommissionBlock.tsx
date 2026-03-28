interface CommissionBlockProps {
  title: string;
  items: string[];
}

const CommissionBlock = ({ title, items }: CommissionBlockProps) => (
  <div className="glass-card mb-6">
    <h4 className="font-heading font-bold text-lg mb-4" style={{ color: 'hsl(var(--primary))' }}>{title}</h4>
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="benefit-item"><span>{item}</span></div>
      ))}
    </div>
  </div>
);

export default CommissionBlock;
