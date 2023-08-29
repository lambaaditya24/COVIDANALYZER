import csv
from collections import defaultdict
import json

import nimfa
import numpy as np

def main():
    # Read the csv into memory to avoid reading through the file multiple times.
    original_data = []
    with open("../data/new_york_covid_data.csv", newline="") as csvfile:
        original_data = list(csv.DictReader(csvfile))

    # Get a list of counties at the beginning so missing data can be padding in
    # without changing the alignment/shape of the matrix.
    # Not sure if Python always iterates over sets in the same order (important
    # for knowing which row of the data corresponds to which county later), so
    # convert the set to a list and sort alphabetically.
    counties = list({row["County"] for row in original_data})
    counties.sort()

    # First, group data by date.
    data_by_date = defaultdict(dict)
    for row in original_data:
        date = row["Date"]
        county = row["County"]
        new_positives = row["New Positives"]

        # Missing data is encoded as "~"; read as 0.
        if new_positives == "~":
            new_positives = 0

        data_by_date[date][county] = float(new_positives)

    # Using this grouping, pad missing county data for each date.
    for timeslice in data_by_date.values():
        for county in counties:
            if county not in timeslice:
                timeslice[county] = 0

    # Finally, put the dataset back together.
    # This will result in an array in which each row represents a county, and
    # each column represents a time period. This is the format used for NMF
    # in the paper.
    final_data = [
        [timeslice[county]                       # value
        for timeslice in data_by_date.values()]  # column
        for county in counties                   # row
    ]

    for rank in [3, 4, 5]:
        nmf = nimfa.Nmf(np.array(final_data), rank=rank)
        nmf_fit = nmf()

        with open(f"../data/rank{rank}W.json", "w") as f:
            json.dump(nmf_fit.fit.W.tolist(), f, indent=2)

        with open(f"../data/rank{rank}H.json", "w") as f:
            json.dump(nmf_fit.fit.H.tolist(), f, indent=2)

    with open("../data/nmf_data_mapping.md", "w") as f:
        f.write("# Index/area mapping\n")
        f.write(
            "These values represent the rows of the original matrix before "
            "factorization, and correspond to the rows of W.\n"
        )
        f.write("\n")
        f.writelines(f"{i}: {county}\n\n" for i, county in enumerate(counties))

        f.write("\n")
        f.write("# Index/timeslice mapping\n")
        f.write(
            "These values represent the columns of the original matrix before "
            "factorization, and correspond to the columns of H.\n"
        )
        f.write("\n")
        f.writelines(f"{i}: {date}\n\n" for i, date in enumerate(data_by_date.keys()))

if __name__ == "__main__":
    main()
