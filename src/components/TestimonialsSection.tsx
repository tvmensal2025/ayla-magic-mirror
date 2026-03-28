const testimonials = [
  { name: "Maria S.", location: "São Paulo, SP", text: "Desde que me cadastrei na iGreen, estou economizando 15% na minha conta de luz todo mês. Sem nenhum custo!" },
  { name: "João P.", location: "Belo Horizonte, MG", text: "Achei que era bom demais para ser verdade, mas já são 6 meses recebendo desconto. Recomendo a todos!" },
  { name: "Ana C.", location: "Rio de Janeiro, RJ", text: "Além do desconto na conta de luz, ainda uso o iGreen Club para economizar nas compras do dia a dia." },
  { name: "Carlos M.", location: "Uberlândia, MG", text: "Com as indicações, consegui zerar minha conta de luz! O programa de cashback é incrível." },
];

const StarIcon = () => (
  <svg className="w-5 h-5 text-accent" fill="currentColor" viewBox="0 0 20 20">
    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
  </svg>
);

const TestimonialsSection = () => (
  <section className="section-gradient relative overflow-hidden">
    <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ background: 'radial-gradient(circle at 50% 80%, hsl(130, 100%, 36%), transparent 50%)' }} />
    <div className="section-container relative z-10">
      <div className="badge-green mx-auto mb-6">Depoimentos</div>
      <h2 className="section-heading mb-4">Clientes satisfeitos iGreen Energy</h2>
      <p className="text-center text-muted-foreground text-lg mb-14">
        Mais de 170 mil clientes já estão economizando na conta de luz
      </p>

      {/* Video Testimonials */}
      <div className="grid sm:grid-cols-2 gap-6 mb-14 max-w-4xl mx-auto">
        <div className="rounded-2xl overflow-hidden border border-border relative" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="absolute inset-0 rounded-2xl border border-primary/10 z-10 pointer-events-none" />
          <video controls preload="metadata" className="w-full aspect-video">
            <source src="/videos/depoimento-1.mp4" type="video/mp4" />
          </video>
        </div>
        <div className="rounded-2xl overflow-hidden border border-border relative" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="absolute inset-0 rounded-2xl border border-primary/10 z-10 pointer-events-none" />
          <video controls preload="metadata" className="w-full aspect-video">
            <source src="/videos/depoimento-2.mp4" type="video/mp4" />
          </video>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {testimonials.map((t, i) => (
          <div key={i} className="glass-card group cursor-default">
            <div className="flex items-center gap-1 mb-4">
              {[...Array(5)].map((_, j) => <StarIcon key={j} />)}
            </div>
            <p className="text-foreground/85 text-sm mb-5 leading-relaxed italic">"{t.text}"</p>
            <div className="pt-4 border-t border-border">
              <p className="font-heading font-bold text-sm" style={{ color: 'hsl(var(--primary))' }}>{t.name}</p>
              <p className="text-muted-foreground text-xs">{t.location}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default TestimonialsSection;
