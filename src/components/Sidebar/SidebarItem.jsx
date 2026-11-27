import "./SidebarItem.css";

export default function SidebarItem({ icon, label }) {
    
    return (
        <button className="sidebar-item">
            <img 
                className="sidebar-item__icon"
                src={icon}
                alt={label}
            />

            <span className="sidebar-item__tooltip">
                {label}
            </span>

        </button>
    )

}