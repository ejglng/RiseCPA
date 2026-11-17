
import "./style.css";

export default function Tooltip() {
    return (
        <div className="c-tooltip">

            <button
                className="c-tooltip-close"
                type="button"
                aria-label="Close guide"
            >
                <img
                    src="https://placecats.com/20/20"
                    alt=""
                />
            </button>

            <div className="c-tooltips-container">

                <div className="tooltip-step">
                    <img
                        src="https://placecats.com/100/100"
                        alt="Search icon"
                        className="tooltip-icon"
                    />
                    <h3 className="tooltip-heading">Search</h3>
                    <p className="tooltip-description">
                        Find documents and resources using search and filters.
                    </p>
                </div>

                <div className="tooltip-step">
                    <img
                        src="https://placecats.com/100/100"
                        alt="Sidebar icon"
                        className="tooltip-icon"
                    />
                    <h3 className="tooltip-heading">Sidebar</h3>
                    <p className="tooltip-description">
                        Navigate easily between pages and available resources.
                    </p>
                </div>

                <div className="tooltip-step">
                    <img
                        src="https://placecats.com/100/100"
                        alt="Quick Access icon"
                        className="tooltip-icon"
                    />
                    <h3 className="tooltip-heading">Quick Access</h3>
                    <p className="tooltip-description">
                        Open frequently used documents and important links.
                    </p>
                </div>

                <div className="tooltip-step">
                    <img
                        src="https://placecats.com/100/100"
                        alt="News Hub icon"
                        className="tooltip-icon"
                    />
                    <h3 className="tooltip-heading">News Hub</h3>
                    <p className="tooltip-description">
                        Stay informed with company news and industry updates.
                    </p>
                </div>

            </div>
        </div>
    );
}
