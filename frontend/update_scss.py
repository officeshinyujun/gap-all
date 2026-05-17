import os
import re

directory = '/Users/yjshin/projects/gap/frontend'
spacing_values = {'4', '6', '8', '10', '12', '14', '16', '20', '24', '32'}

def replace_spacing(match):
    val = match.group(1)
    if val in spacing_values:
        return f'$spacing-{val}'
    return match.group(0)

for root, _, files in os.walk(directory):
    for file in files:
        if file.endswith('.scss'):
            filepath = os.path.join(root, file)
            with open(filepath, 'r') as f:
                content = f.read()
            
            # Replace rgb(193, 211, 250) with $brand-secondary
            new_content = content.replace('rgb(193, 211, 250)', '$brand-secondary')
            
            # Replace hardcoded pixels with variables
            new_content = re.sub(r'\b(\d+)px\b', replace_spacing, new_content)
            
            if new_content != content:
                with open(filepath, 'w') as f:
                    f.write(new_content)
                print(f"Updated {filepath}")
