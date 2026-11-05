export default function AboutSection() {
  return (
    <section id="about" className="py-20 px-4 sm:px-6 lg:px-8 bg-secondary/50">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-12 text-center">About Us</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div>
            <h3 className="text-2xl font-bold text-primary mb-4">Our Mission</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              At LuxeStay, our mission is to provide unforgettable hospitality experiences by offering premium
              accommodations combined with exceptional service. We believe every guest deserves to feel valued and
              pampered during their stay.
            </p>
          </div>

          <div>
            <h3 className="text-2xl font-bold text-primary mb-4">Our Vision</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We envision being the preferred choice for luxury travelers worldwide. Through continuous innovation,
              sustainability, and customer-centric service, we aim to set new standards in the hospitality industry and
              create lasting memories for our guests.
            </p>
          </div>
        </div>

        <div className="mt-12 p-8 bg-card rounded-xl">
          <h3 className="text-xl font-bold text-foreground mb-4">Why Choose LuxeStay?</h3>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <span className="text-accent text-xl">✓</span>
              <span className="text-foreground">Premium accommodations with world-class amenities</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-accent text-xl">✓</span>
              <span className="text-foreground">24/7 dedicated customer support</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-accent text-xl">✓</span>
              <span className="text-foreground">Competitive pricing with special packages</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-accent text-xl">✓</span>
              <span className="text-foreground">Easy booking and flexible cancellation</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  )
}
