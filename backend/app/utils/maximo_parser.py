import csv
import io
from datetime import datetime

def parse_maximo_csv(csv_content: str):
    # Expected columns: WO_Number,Description,Priority,Status,Trainset_Number,Category,Opened_Date
    f = io.StringIO(csv_content)
    reader = csv.DictReader(f)
    job_cards = []
    
    priority_map = {
        '1-Emergency': 'critical',
        '2-Urgent': 'high',
        '3-High': 'normal',
        '4-Medium': 'normal',
        '5-Low': 'low'
    }
    
    status_map = {
        'WAPPR': 'open',
        'WSCH': 'open',
        'INPRG': 'in_progress',
        'COMP': 'closed',
        'CLOSE': 'closed'
    }
    
    for row in reader:
        try:
            priority = priority_map.get(row.get('Priority', '').strip(), 'normal')
            status = status_map.get(row.get('Status', '').strip(), 'open')
            opened_date_str = row.get('Opened_Date', '').strip()
            opened_date = None
            if opened_date_str:
                try:
                    opened_date = datetime.strptime(opened_date_str, "%Y-%m-%d %H:%M:%S").isoformat()
                except ValueError:
                    opened_date = datetime.utcnow().isoformat()
            
            job_cards.append({
                "maximo_ref": row.get('WO_Number', '').strip(),
                "description": row.get('Description', '').strip(),
                "priority": priority,
                "status": status,
                "trainset_number": row.get('Trainset_Number', '').strip(),
                "category": row.get('Category', '').strip(),
                "opened_at": opened_date or datetime.utcnow().isoformat()
            })
        except Exception as e:
            continue
            
    return job_cards
