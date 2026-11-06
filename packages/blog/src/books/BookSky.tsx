/** Keep the fixed sky outside animated route containers, whose transforms would constrain it. */
export function BookSky() {
  return (
    <div className="book-sky-world" aria-hidden="true">
      <div className="book-shelf-sky">
        <span className="book-sky-light" />
        <span className="book-sky-cloud book-sky-cloud-one" />
        <span className="book-sky-cloud book-sky-cloud-two" />
        <span className="book-sky-cloud book-sky-cloud-three" />
      </div>
    </div>
  );
}
