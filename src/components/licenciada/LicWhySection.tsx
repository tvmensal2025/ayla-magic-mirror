const LicWhySection = () => (
  <section className="bg-secondary">
    <div className="section-container text-center">
      <h2 className="section-heading mb-10">Porque ser um licenciado iGreen Energy?</h2>
      <div className="max-w-4xl mx-auto rounded-2xl overflow-hidden shadow-lg">
        <video controls className="w-full aspect-video">
          <source src="/videos/igreen-energy.mp4" type="video/mp4" />
        </video>
      </div>
    </div>
  </section>
);

export default LicWhySection;
