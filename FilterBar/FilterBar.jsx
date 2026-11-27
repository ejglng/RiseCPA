import "./FilterBar.css";

export default function FilterBar() {
    return (
        <div className='filter__container'>
            <button
                className='filter__button'
                type='button'
            >
                <span>Filter</span>
            </button>

            <div className='filter__panel'>
                <h3>Filter Options</h3>

                <div className='filter__group'>
                    <label htmlFor='department'>Department</label>
                    <select id='department'>
                        <option value=''>All</option>
                        <option value='tax'>Tax</option>
                        <option value='accounting'>Accounting</option>
                        <option value='hr'>Human Resources</option>
                        <option value='finance'>Finance</option>
                    </select>
                </div>

                <div className='filter__group'>
                    <label htmlFor='document__type'>Document Type</label>
                    <select id='document__type'>
                        <option value=''>All</option>
                        <option value='pdf'>PDF</option>
                        <option value='docx'>Word Document</option>
                        <option value='xlsx'>Excel Spreadsheet</option>
                    </select>
                </div>

                <div className='filter__group'>
                    <label htmlFor='year__modified'>Year Modified</label>
                    <select id='year__modified'>
                        <option value=''>All</option>
                        <option value='2026'>2026</option>
                        <option value='2025'>2025</option>
                        <option value='2024'>2024</option>
                    </select>
                </div>

                <div className='filter__actions'>
                    <button
                        className='clear__button'
                        type='button'
                    >
                        Clear All
                    </button>

                    <button
                        className='apply__button'
                        type='button'
                    >
                        Apply Filters
                    </button>
                </div>
            </div>
        </div>
    );
}
