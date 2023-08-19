# flowr

[![codecov](https://codecov.io/bb/Code-Inspect/flowr/branch/main/graph/badge.svg)](https://codecov.io/gh/Code-Inspect/flowr)


A program slicer and analyzer for R programs.

----

*flowr* is actively developed by *Florian Sihler* (contact at: <florian.sihler@uni-ulm.de>) under the 
[GPLv3 License](LICENSE) as part of his master's thesis.

----


## Setup

To work with *flowr* you need [*R*](https://www.r-project.org/) installed and on your path.

### Development

For development, we encourage you to enable the project-specific git-hooks by running:

```shell
git config --local core.hooksPath .githooks/
```


## Usage

### Produce a Static Slice

See,

```shell
npm run slicer -- --help 
```

For example, you can run

```shell
npm run slicer -- --stats --criterion "8:3;3:1;12@product" test/testfiles/example.R
```

Inspect the resulting slice at `test/testfiles/example.R.slice`, with the stats at
`test/testfiles/example.R.stats`.

### Conduct Slice Benchmarking

See,

```shell
npm run benchmark -- --help 
```


### Generate Usage Statistics

See

```shell
npm run stats -- --help 
```


<details>

<summary>  <b> How to Reproduce the Statistics From the Master’s Thesis </b> </summary>

Each step assumes, that you start in the root directory of this repository. You need a working installation of *R* and *npm*.
This mainly describes how to extract the statistics from the CRAN package sources, however, starting from step 3,
the steps are basically the same and only differ in the paths that have to be supplied (the social science sources are attached alongside the [master's thesis release](https://github.com/Code-Inspect/flowr/releases/tag/v1.0.0)).

1. If you want to **update** the set of packages, use the [scripts/top-downloads.R](scripts/top-downloads.R) script and potentially modify the package limit by setting `N` to a different value.
The (sorted) results should be versioned and can be found in [scripts/top-r-downloads.txt](scripts/top-r-downloads.txt).
    ```shell
    cd scripts/ && Rscript top-downloads.R
    ```

2. If you haven't done so already, or updated the package list in the previous step, **download** the package sources.
   For this, you can use the [scripts/download-top-pkg-sources.R](scripts/download-top-pkg-sources.R) script.
   But **make sure**, that you set the `to` variable to the output path you want.
   ```shell
    cd scripts/ && Rscript download-top-pkg-sources.R
   ```
   Downloading and extracting the sources can take a while.

3. Make sure you have the latest version of the *flowr* package installed.
   ```shell
   npm install
   ```

4. Now you can run the statistics program on the downloaded sources.
   You can do this in two ways (check `npm run stats -- --help ` for more information). 
   In any case, the extraction may take a long time, so be prepared for that!
   Furthermore, you may want to store the output of the tool as it provides additional information.

   * **On the complete folder**
       ```shell
       npm run stats -- --input <location-of-source folders> --output-dir <output-dir>
       ```
       If you left the `to` variable in the previous step at its default value, you may want something like this:
       ```shell
       npm run stats -- --input "${HOME}/r-pkg-sources/" --output-dir "./statistics-out/cran-500"
       ```
   
   * **On a folder subset**\
     You may very well have downloaded all or more package sources than you want to analyze.
     The [scripts/extract-top-stats.sh](scripts/extract-top-stats.sh) shell script may help selecting a subset of packages.

   Theoretically, you should be able to stop the extraction at any time and still get usable information with the next step,
   of course limited to only those files that have been processed so far. 

5. Afterward, your output folder should contain several folders with the recorded stats of all extracted features.
   To make sense of them, you need to use the post-processor, which prints the summarized information to the command-line:
   ```shell
   npm run stats -- --post-process "./statistics-out/cran-500" --no-ansi > "./statistics-out/cran-500/cran-500-summary.log"
   ```
   Additionally, the post-processor will create `.dat` files for several (sub-)features which contains histogram information.
   Depending on the size of the sources, you may want to 
   
   * increase the heap-size of node (`export NODE_OPTIONS=--max_old_space_size=8192`).
   * limit the features to be analyzed by using the `--features` option.

    By default, the post-processing will limit the histograms to the top 50 values, because who needs more histograms?!   
    
</details>

### Export RDF N-Quads

See

```shell
npm run export-quads -- --help 
```
