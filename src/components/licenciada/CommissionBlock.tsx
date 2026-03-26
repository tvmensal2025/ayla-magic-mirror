interface CommissionBlockProps {
  title: string;
  items: string[];
}

const CommissionBlock = ({ title, items }: CommissionBlockProps) => (
  <div className="mb-8">
    <h4 className="text-primary font-heading font-bold text-lg mb-4">{title}</h4>
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="benefit-item"><span>{item}</span></div>
      ))}
    </div>
  </div>
);

export default CommissionBlock;
