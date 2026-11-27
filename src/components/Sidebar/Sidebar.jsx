import "./Sidebar.css";
import SidebarItem from "./SidebarItem";

export default function Sidebar() {

    return (
        <div className="sidebar">
             <SidebarItem 
                icon="/icons/Home.svg" 
                label="Home"
            />

            <SidebarItem 
                icon="/icons/department.svg" 
                label="Departments"
            />

            <SidebarItem 
                icon="/icons/Document.svg" 
                label="Documents"
            />

            <SidebarItem 
                icon="/icons/Drive.svg" 
                label="Drive"
            />

            <SidebarItem 
                icon="/icons/guide.svg" 
                label="Guides"
            />

            <SidebarItem 
                icon="/icons/Add.svg" 
                label="Add"
            />
        </div>
    )

}